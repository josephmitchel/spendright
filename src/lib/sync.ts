import { eq, getTableColumns, inArray, sql } from 'drizzle-orm';
import type { PgUpdateSetSource } from 'drizzle-orm/pg-core';
import { type AccountBase, type Transaction as PlaidTransaction } from 'plaid';
import { accounts, items, transactions, type ItemRow } from '@/db/schema';
import { refreshItemAccounts } from '@/lib/accounts';
import { serializeByKey } from '@/lib/async-coordination';
import { categoryKindSources, type CategoryKindSource } from '@/lib/category-kind-sources';
import {
  assertNeverKind,
  categoryKindKeys,
  kindForAmount,
  type CategoryKind,
} from '@/lib/category-kinds';
import { decrypt } from '@/lib/crypto';
import { db, type DbTransaction } from '@/lib/db';
import { publicErrorMessage } from '@/lib/errors';
import { globalSingleton } from '@/lib/global-singleton';
import { logError, logWarn } from '@/lib/log';
import { getAccounts, syncTransactions } from '@/lib/plaid';
import { plaidErrorBody } from '@/lib/plaid-errors';
import {
  MAX_SKIPPED_SYNCS,
  skippedItemErrorMessage,
  skippedSyncLogLine,
} from '@/lib/sync-messages';

function toTransactionRow(txn: PlaidTransaction, itemId: string) {
  return {
    transactionId: txn.transaction_id,
    accountId: txn.account_id,
    itemId,
    date: txn.date,
    name: txn.name ?? null,
    merchantName: txn.merchant_name ?? null,
    amount: String(txn.amount),
    isoCurrencyCode: txn.iso_currency_code ?? null,
    // Reserved for future auto-categorization; never rendered.
    // Design: plaid-category-reserved.
    category: txn.personal_finance_category?.primary ?? txn.category?.[0] ?? null,
    pending: txn.pending ?? null,
    plaidTransaction: txn,
  };
}

export interface SyncItemResult {
  itemId: string;
  added: number;
  modified: number;
  removed: number;
  // Rows for accounts not in the database. Non-zero means the item did not
  // finish syncing cleanly even though nothing threw.
  skipped: number;
  // True when the skipped rows were dropped (cursor advanced) rather than held.
  dropped: boolean;
}

export interface SyncItemOptions {
  // True when the caller already fetched AND stored the item's accounts (the
  // link flow does both). Design: accounts-refreshed-per-sync.
  accountsAlreadyStored?: boolean;
  // Passed through to syncTransactions.
  notReadyRetries?: number;
}

// Per-item lock: concurrent syncItem calls on one item would race the cursor
// write. Design: scheduled-sync.
const syncItemTails = globalSingleton('syncItemTails', () => new Map<string, Promise<void>>());

export function syncItem(item: ItemRow, options?: SyncItemOptions): Promise<SyncItemResult> {
  return serializeByKey(syncItemTails, item.itemId, () => runSyncItem(item, options));
}

// Records a sync failure on the item row (best-effort — the caller's flow
// must finish either way) and returns the user-facing message.
// Design: error-message-allow-list.
export async function recordSyncFailure(
  itemId: string,
  err: unknown,
  fallback: string,
): Promise<string> {
  const message = publicErrorMessage(err, fallback);
  const plaidError = plaidErrorBody(err);
  try {
    await db
      .update(items)
      // { message } is the non-Plaid shape of items.error.
      .set({ error: plaidError ?? { message }, updatedAt: sql`now()` })
      .where(eq(items.itemId, itemId));
  } catch (writeErr) {
    logError(`Could not record the sync failure for item ${itemId}:`, writeErr);
  }
  return message;
}

// Guard for the transactions.account_id FK. Must mirror the FK exactly, so
// keyed on account_id alone (not item_id) and read from the DB rather than
// from the Plaid account refresh. Design: bounded-cursor-hold.
async function knownAccountIdsFor(
  tx: DbTransaction,
  batch: PlaidTransaction[],
): Promise<Set<string>> {
  const batchAccountIds = [...new Set(batch.map((txn) => txn.account_id))];
  if (batchAccountIds.length === 0) return new Set();
  const rows = await tx
    .select({ accountId: accounts.accountId })
    .from(accounts)
    .where(inArray(accounts.accountId, batchAccountIds));
  return new Set(rows.map((row) => row.accountId));
}

interface CarriedSelection {
  cardCategoryId: number | null;
  rewardRate: string | null;
  creditCategoryId: number | null;
}

// Ids from `candidateIds` whose category row still exists. A carry is a
// fresh insert, so a stale id would abort the whole sync.
async function liveCategoryIds(
  tx: DbTransaction,
  { table }: CategoryKindSource,
  candidateIds: (number | null)[],
): Promise<Set<number>> {
  const ids = [...new Set(candidateIds.filter((id): id is number => id !== null))];
  if (ids.length === 0) return new Set();
  const rows = await tx.select({ id: table.id }).from(table).where(inArray(table.id, ids));
  return new Set(rows.map((row) => row.id));
}

// Plaid reposts a pending transaction under a new id (old id in `removed`,
// new one in `added` with pending_transaction_id). Resolves the selections to
// carry over before the pending rows are deleted, keyed by pending id.
// Design: pending-to-posted-carry.
async function resolveCarriedSelections(
  tx: DbTransaction,
  added: PlaidTransaction[],
): Promise<Map<string, CarriedSelection>> {
  const carried = new Map<string, CarriedSelection>();
  const pendingIds = added
    .map((txn) => txn.pending_transaction_id)
    .filter((id): id is string => Boolean(id));
  if (pendingIds.length === 0) return carried;

  // Locked: a concurrent PATCH on a pending row would otherwise commit a
  // selection after this read decided there was nothing to carry, then lose
  // it when the row is deleted. With the lock, PATCH blocks and gets a 404
  // (row gone) or a 503 (lock timeout) instead of a false 200.
  const pendingRows = await tx
    .select({
      transactionId: transactions.transactionId,
      accountId: transactions.accountId,
      cardCategoryId: transactions.cardCategoryId,
      rewardRate: transactions.rewardRate,
      creditCategoryId: transactions.creditCategoryId,
    })
    .from(transactions)
    .where(inArray(transactions.transactionId, pendingIds))
    .for('update');

  const liveCardCategoryIds = await liveCategoryIds(
    tx,
    categoryKindSources.card,
    pendingRows.map((row) => row.cardCategoryId),
  );
  const liveCreditCategoryIds = await liveCategoryIds(
    tx,
    categoryKindSources.credit,
    pendingRows.map((row) => row.creditCategoryId),
  );

  for (const row of pendingRows) {
    const cardCategoryExists =
      row.cardCategoryId !== null && liveCardCategoryIds.has(row.cardCategoryId);
    const creditCategoryExists =
      row.creditCategoryId !== null && liveCreditCategoryIds.has(row.creditCategoryId);
    // A rate carries on its own, without a live category link: it is a
    // historical snapshot of what the purchase earned.
    if (cardCategoryExists || creditCategoryExists || row.rewardRate !== null) {
      carried.set(row.transactionId, {
        cardCategoryId: cardCategoryExists ? row.cardCategoryId : null,
        rewardRate: row.rewardRate,
        creditCategoryId: creditCategoryExists ? row.creditCategoryId : null,
      });
    }
  }
  return carried;
}

// Carry only the kind matching the posted amount's sign; a sign flip drops
// the carry. Spend side carries on either column so an orphaned rate
// survives. Design: category-kind-sign-rule.
function carriedColumns(
  carry: CarriedSelection | undefined,
  kind: CategoryKind,
):
  | { creditCategoryId: number }
  | { cardCategoryId: number | null; rewardRate: string | null }
  | null {
  if (!carry) return null;
  switch (kind) {
    case 'credit':
      return carry.creditCategoryId != null ? { creditCategoryId: carry.creditCategoryId } : null;
    case 'card':
      return carry.cardCategoryId != null || carry.rewardRate != null
        ? { cardCategoryId: carry.cardCategoryId, rewardRate: carry.rewardRate }
        : null;
    default:
      return assertNeverKind(kind);
  }
}

// Rows per INSERT statement — well under Postgres's 65,535 bind-parameter
// cap at this table's column count.
const UPSERT_CHUNK_SIZE = 500;

// Per-row skip lines past this count are elided; skippedSyncLogLine carries
// the total either way.
const SKIPPED_ROW_LOG_CAP = 20;

// A batch row: the base columns plus any carried selection riding the insert.
type TransactionUpsertValues = ReturnType<typeof toTransactionRow> &
  Partial<
    Pick<typeof transactions.$inferInsert, 'cardCategoryId' | 'rewardRate' | 'creditCategoryId'>
  >;

// The on-conflict SET for one kind's batch: excluded.* for the row builder's
// columns, the matching kind's selection columns untouched, every other
// kind's cleared. Design: category-kind-sign-rule.
function conflictSetForKind(
  kind: CategoryKind,
  rowKeys: string[],
): PgUpdateSetSource<typeof transactions> {
  const columns = getTableColumns(transactions);
  const set: Record<string, unknown> = {};
  for (const key of rowKeys) {
    const column = columns[key as keyof typeof columns];
    if (!column) throw new Error(`sync: toTransactionRow writes unknown column ${key}`);
    set[key] = sql.raw(`excluded."${column.name}"`);
  }
  set.updatedAt = sql`now()`;
  for (const otherKind of Object.keys(categoryKindKeys) as CategoryKind[]) {
    if (otherKind === kind) continue;
    for (const column of categoryKindKeys[otherKind].writeColumns) set[column] = null;
  }
  // Built key-by-key above, so the shape is asserted rather than inferred.
  return set as PgUpdateSetSource<typeof transactions>;
}

// Upserts the batch; rows for accounts outside `knownAccountIds` are skipped
// and counted, not inserted. Batched per kind per chunk: the transaction
// holds locks category PATCHes compete for, so its duration must stay
// bounded by statement count. Design: bounded-cursor-hold.
async function upsertTransactions(
  tx: DbTransaction,
  itemId: string,
  upserts: PlaidTransaction[],
  knownAccountIds: Set<string>,
  carried: Map<string, CarriedSelection>,
): Promise<number> {
  let skipped = 0;
  // Last-wins by id: one statement must not update the same row twice
  // (Postgres rejects it), and the later occurrence is the one the old
  // sequential per-row loop would have applied last anyway.
  const rowsById = new Map<string, { values: TransactionUpsertValues; kind: CategoryKind }>();
  let baseRowKeys: string[] | null = null;
  for (const txn of upserts) {
    if (!knownAccountIds.has(txn.account_id)) {
      skipped++;
      if (skipped <= SKIPPED_ROW_LOG_CAP) {
        logError(
          `sync ${itemId}: transaction ${txn.transaction_id} references unknown account ${txn.account_id} — skipped`,
        );
      } else if (skipped === SKIPPED_ROW_LOG_CAP + 1) {
        logError(`sync ${itemId}: further skipped rows elided — see the batch summary line`);
      }
      continue;
    }
    const row = toTransactionRow(txn, itemId);
    baseRowKeys ??= Object.keys(row);
    const carry = txn.pending_transaction_id ? carried.get(txn.pending_transaction_id) : undefined;
    const kind = kindForAmount(row.amount);
    const carriedValues = carriedColumns(carry, kind);
    rowsById.set(row.transactionId, {
      values: carriedValues ? { ...row, ...carriedValues } : row,
      kind,
    });
  }
  if (!baseRowKeys) return skipped;

  // Grouped by kind because the SET differs per kind; the SET reads
  // baseRowKeys, never a carrying row's keys. Design: pending-to-posted-carry.
  // A field a row omits renders as DEFAULT (Verified-on: drizzle-orm@0.45.2).
  const groups: Record<CategoryKind, TransactionUpsertValues[]> = { card: [], credit: [] };
  for (const { values, kind } of rowsById.values()) groups[kind].push(values);
  for (const kind of Object.keys(groups) as CategoryKind[]) {
    const rows = groups[kind];
    if (rows.length === 0) continue;
    const set = conflictSetForKind(kind, baseRowKeys);
    for (let start = 0; start < rows.length; start += UPSERT_CHUNK_SIZE) {
      await tx
        .insert(transactions)
        .values(rows.slice(start, start + UPSERT_CHUNK_SIZE))
        .onConflictDoUpdate({ target: transactions.transactionId, set });
    }
  }
  return skipped;
}

// Stored on items.error when the account refresh failed; cleared by the next
// fully clean sync. Design: accounts-refreshed-per-sync.
const ACCOUNT_REFRESH_FAILED_MESSAGE =
  'The account refresh failed on the last sync — balances may be stale (check the server ' +
  'log). Transactions still synced.';

// Cursor/skip-counter/error bookkeeping on the item row. The counter is read
// under lock, not from the caller's possibly stale ItemRow; the cursor
// advances only on a clean sync or a drop.
// Design: bounded-cursor-hold, accounts-refreshed-per-sync.
async function recordSyncOutcome(
  tx: DbTransaction,
  itemId: string,
  skipped: number,
  cursor: string | null,
  accountRefreshFailed: boolean,
): Promise<{ consecutiveSkippedSyncs: number; dropped: boolean }> {
  const [itemState] = await tx
    .select({ skippedSyncs: items.skippedSyncs })
    .from(items)
    .where(eq(items.itemId, itemId))
    .for('update');
  // No row: the item was deleted while this sync ran; throwing records a
  // failure instead of reporting a clean outcome for a row never written.
  if (!itemState) throw new Error(`sync ${itemId}: item row disappeared mid-sync`);
  const consecutiveSkippedSyncs = skipped === 0 ? 0 : itemState.skippedSyncs + 1;
  const dropped = consecutiveSkippedSyncs >= MAX_SKIPPED_SYNCS;

  await tx
    .update(items)
    .set({
      ...(skipped === 0 || dropped ? { cursor } : {}),
      skippedSyncs: dropped ? 0 : consecutiveSkippedSyncs,
      // The skip message wins over the refresh one: held/dropped rows are the
      // more actionable state, and the refresh failure is still in the log.
      error:
        skipped > 0
          ? { message: skippedItemErrorMessage(skipped, consecutiveSkippedSyncs, dropped) }
          : accountRefreshFailed
            ? { message: ACCOUNT_REFRESH_FAILED_MESSAGE }
            : null,
      updatedAt: sql`now()`,
    })
    .where(eq(items.itemId, itemId));

  return { consecutiveSkippedSyncs, dropped };
}

async function runSyncItem(item: ItemRow, options?: SyncItemOptions): Promise<SyncItemResult> {
  const accessToken = decrypt(item.accessToken);
  // Plaid calls stay outside the DB transaction. The account refresh is
  // best-effort: on failure the sync proceeds against stored accounts.
  // Design: accounts-refreshed-per-sync
  let accountRefreshFailed = false;
  if (!options?.accountsAlreadyStored) {
    let plaidAccounts: AccountBase[] = [];
    try {
      plaidAccounts = await getAccounts(accessToken);
    } catch (err) {
      accountRefreshFailed = true;
      logError(
        `sync ${item.itemId}: accountsGet failed — syncing without an account refresh:`,
        err,
      );
    }
    if (plaidAccounts.length > 0) {
      // A failed upsert of an EXISTING row leaves its balances silently
      // stale (the known-account guard only covers absent rows), so store
      // failures count as a failed refresh.
      const storeFailures = await refreshItemAccounts(item.itemId, plaidAccounts);
      if (storeFailures.length > 0) accountRefreshFailed = true;
    }
  }

  const { added, modified, removed, cursor } = await syncTransactions(accessToken, item.cursor, {
    notReadyRetries: options?.notReadyRetries,
  });

  const { skipped, outcome } = await db.transaction(async (tx) => {
    const upserts = [...added, ...modified];
    const knownAccountIds = await knownAccountIdsFor(tx, upserts);
    // The carry must resolve before the pending rows are deleted below.
    const carried = await resolveCarriedSelections(tx, added);
    const skippedCount = await upsertTransactions(
      tx,
      item.itemId,
      upserts,
      knownAccountIds,
      carried,
    );

    const removedIds = removed
      .map((r) => r.transaction_id)
      .filter((id): id is string => Boolean(id));
    if (removedIds.length > 0) {
      await tx.delete(transactions).where(inArray(transactions.transactionId, removedIds));
    }

    return {
      skipped: skippedCount,
      outcome: await recordSyncOutcome(tx, item.itemId, skippedCount, cursor, accountRefreshFailed),
    };
  });

  // On a drop this log line is the only lasting record of what was lost.
  if (skipped > 0) {
    const line = skippedSyncLogLine(
      item.itemId,
      skipped,
      outcome.consecutiveSkippedSyncs,
      outcome.dropped,
    );
    if (outcome.dropped) logError(line);
    else logWarn(line);
  }

  return {
    itemId: item.itemId,
    added: added.length,
    modified: modified.length,
    removed: removed.length,
    skipped,
    dropped: outcome.dropped,
  };
}
