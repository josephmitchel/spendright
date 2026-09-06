import { eq, inArray, sql } from 'drizzle-orm';
import { type AccountBase, type Transaction as PlaidTransaction } from 'plaid';
import {
  accounts,
  cardCategories,
  creditCategories,
  items,
  transactions,
  type ItemRow,
} from '@/db/schema';
import { storeAccounts } from '@/lib/accounts';
import { isInflowAmount } from '@/lib/amounts';
import { loadCardCatalog } from '@/lib/card-catalog';
import { decrypt } from '@/lib/crypto';
import { db, type DbTransaction } from '@/lib/db';
import { plaidErrorBody, publicErrorMessage } from '@/lib/errors';
import { globalSingleton } from '@/lib/global-singleton';
import { logError } from '@/lib/log';
import { getAccounts, syncTransactions } from '@/lib/plaid';
import { serializeByKey } from '@/lib/serialize';
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
    // Stored and served but never rendered; reserved for future
    // auto-categorization. Design: plaid-category-reserved.
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
  // Accounts the caller already fetched AND stored (the link flow does both);
  // the sync then skips its own accountsGet and account-store pass, so each
  // link stores its accounts exactly once. Design: accounts-refreshed-per-sync.
  plaidAccounts?: AccountBase[];
  // Passed through to syncTransactions.
  notReadyRetries?: number;
}

// Per-item serialization for the cursor-write invariant: two concurrent
// syncItem calls on one item would race the cursor write, and syncItem has two
// entry points (syncAllItems and the exchange route's inline initial sync), so
// the lock lives here, covering every caller by construction, rather than in
// any one of them. Design: scheduled-sync.
const syncItemTails = globalSingleton('syncItemTails', () => new Map<string, Promise<void>>());

export function syncItem(item: ItemRow, options?: SyncItemOptions): Promise<SyncItemResult> {
  return serializeByKey(syncItemTails, item.itemId, () => runSyncItem(item, options));
}

// Records a sync failure on the item row and returns the user-facing message.
// The message goes through the allow-list because it is stored on items.error
// and shown on every load; the write is best-effort because the caller's flow
// must finish either way. Shared by syncAllItems and the exchange route's
// inline initial sync. Design: error-message-allow-list.
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

// Guard for the transactions.account_id FK: a rejected insert would abort
// the whole sync transaction, cursor included, and wedge the item. Must
// mirror the FK exactly, so keyed on account_id alone (not item_id) and read
// from the DB rather than from the Plaid account refresh.
// Design: bounded-cursor-hold.
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

// Ids from `candidateIds` whose category row still exists. A carry is a fresh
// insert, so a stale id would abort the whole sync.
async function liveCategoryIds(
  tx: DbTransaction,
  table: typeof cardCategories | typeof creditCategories,
  candidateIds: (number | null)[],
): Promise<Set<number>> {
  const ids = [...new Set(candidateIds.filter((id): id is number => id !== null))];
  if (ids.length === 0) return new Set();
  const rows = await tx
    .select({ id: table.id })
    // The cast only widens the overload; the runtime table is the one passed in.
    .from(table as typeof cardCategories)
    .where(inArray(table.id, ids));
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
    cardCategories,
    pendingRows.map((row) => row.cardCategoryId),
  );
  const liveCreditCategoryIds = await liveCategoryIds(
    tx,
    creditCategories,
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
  isInflow: boolean,
):
  | { creditCategoryId: number }
  | { cardCategoryId: number | null; rewardRate: string | null }
  | null {
  if (!carry) return null;
  if (isInflow) {
    return carry.creditCategoryId != null ? { creditCategoryId: carry.creditCategoryId } : null;
  }
  return carry.cardCategoryId != null || carry.rewardRate != null
    ? { cardCategoryId: carry.cardCategoryId, rewardRate: carry.rewardRate }
    : null;
}

// Upserts the batch. Rows for accounts outside `knownAccountIds` are skipped
// (not inserted, counted, logged) instead of aborting the sync; returns the
// skip count. Design: bounded-cursor-hold.
async function upsertTransactions(
  tx: DbTransaction,
  itemId: string,
  upserts: PlaidTransaction[],
  knownAccountIds: Set<string>,
  carried: Map<string, CarriedSelection>,
): Promise<number> {
  let skipped = 0;
  for (const txn of upserts) {
    if (!knownAccountIds.has(txn.account_id)) {
      skipped++;
      console.error(
        `sync ${itemId}: transaction ${txn.transaction_id} references unknown account ${txn.account_id} — skipped`,
      );
      continue;
    }
    const row = toTransactionRow(txn, itemId);
    const carry = txn.pending_transaction_id ? carried.get(txn.pending_transaction_id) : undefined;
    const isInflow = isInflowAmount(row.amount);
    const carriedValues = carriedColumns(carry, isInflow);
    await tx
      .insert(transactions)
      .values(carriedValues ? { ...row, ...carriedValues } : row)
      .onConflictDoUpdate({
        target: transactions.transactionId,
        // Re-syncs never touch the matching kind's selection; only the
        // wrong-kind columns are cleared, which the DB sign constraint
        // requires on a sign flip.
        set: {
          ...row,
          updatedAt: sql`now()`,
          ...(isInflow ? { cardCategoryId: null, rewardRate: null } : { creditCategoryId: null }),
        },
      });
  }
  return skipped;
}

// The cursor/skip-counter/error bookkeeping on the item row. The counter is
// read under lock rather than from the caller's possibly stale ItemRow; a
// clean sync or a drop resets it to 0. The cursor advances only on a clean
// sync or a drop. items.error is written on the first skip and cleared by a
// clean sync. Design: bounded-cursor-hold.
async function recordSyncOutcome(
  tx: DbTransaction,
  itemId: string,
  skipped: number,
  cursor: string | null,
): Promise<{ consecutiveSkippedSyncs: number; dropped: boolean }> {
  const [itemState] = await tx
    .select({ skippedSyncs: items.skippedSyncs })
    .from(items)
    .where(eq(items.itemId, itemId))
    .for('update');
  const consecutiveSkippedSyncs = skipped === 0 ? 0 : (itemState?.skippedSyncs ?? 0) + 1;
  const dropped = consecutiveSkippedSyncs >= MAX_SKIPPED_SYNCS;

  await tx
    .update(items)
    .set({
      ...(skipped === 0 || dropped ? { cursor } : {}),
      skippedSyncs: dropped ? 0 : consecutiveSkippedSyncs,
      error:
        skipped === 0
          ? null
          : { message: skippedItemErrorMessage(skipped, consecutiveSkippedSyncs, dropped) },
      updatedAt: sql`now()`,
    })
    .where(eq(items.itemId, itemId));

  return { consecutiveSkippedSyncs, dropped };
}

async function runSyncItem(item: ItemRow, options?: SyncItemOptions): Promise<SyncItemResult> {
  const accessToken = decrypt(item.accessToken);
  // Plaid calls stay outside the DB transaction. The account refresh is
  // best-effort: on failure the sync proceeds against stored accounts. When
  // the caller passed accounts it already stored them, so the whole refresh
  // is skipped. Design: accounts-refreshed-per-sync
  if (!options?.plaidAccounts) {
    let plaidAccounts: AccountBase[] = [];
    try {
      plaidAccounts = await getAccounts(accessToken);
    } catch (err) {
      logError(
        `sync ${item.itemId}: accountsGet failed — syncing without an account refresh:`,
        err,
      );
    }
    if (plaidAccounts.length > 0) {
      const cardList = await loadCardCatalog(db);
      // Committed before the sync transaction opens; failures are the
      // known-account guard's problem.
      await storeAccounts(plaidAccounts, item.itemId, cardList);
    }
  }

  const { added, modified, removed, cursor } = await syncTransactions(accessToken, item.cursor, {
    notReadyRetries: options?.notReadyRetries,
  });

  // db.transaction returns the callback's value, so the results come out as
  // the return value — no closure mutation, and no placeholder that a future
  // unreached assignment could leave looking like a real clean-sync outcome.
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
      outcome: await recordSyncOutcome(tx, item.itemId, skippedCount, cursor),
    };
  });

  // On a drop this log line is the only lasting record of what was lost. The
  // wording lives in sync-messages.ts with the rest of the policy's strings.
  if (skipped > 0) {
    const line = skippedSyncLogLine(
      item.itemId,
      skipped,
      outcome.consecutiveSkippedSyncs,
      outcome.dropped,
    );
    if (outcome.dropped) console.error(line);
    else console.warn(line);
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
