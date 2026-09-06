import { eq, inArray, sql } from 'drizzle-orm';
import { AccountBase, Transaction as PlaidTransaction } from 'plaid';
import {
  accounts,
  cardCategories,
  cards,
  creditCategories,
  items,
  transactions,
  type ItemRow,
} from '@/db/schema';
import { storeAccounts, type DbTransaction } from '@/lib/accounts';
import { isInflowAmount } from '@/lib/amounts';
import { decrypt } from '@/lib/crypto';
import { db } from '@/lib/db';
import { plaidErrorBody, publicErrorMessage } from '@/lib/errors';
import { loggableError } from '@/lib/log';
import { globalSingleton } from '@/lib/global-singleton';
import { getAccounts, syncTransactions } from '@/lib/plaid';
import { serializeByKey } from '@/lib/serialize';
import { MAX_SKIPPED_SYNCS, skippedItemErrorMessage } from '@/lib/sync-messages';

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
  // Already-fetched accounts, so the accountsGet call is skipped.
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
    console.error(`Could not record the sync failure for item ${itemId}:`, writeErr);
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
  // best-effort: on failure the sync proceeds against stored accounts.
  // Design: accounts-refreshed-per-sync
  let plaidAccounts: AccountBase[] = options?.plaidAccounts ?? [];
  if (!options?.plaidAccounts) {
    try {
      plaidAccounts = await getAccounts(accessToken);
    } catch (err) {
      console.error(
        `sync ${item.itemId}: accountsGet failed — syncing without an account refresh:`,
        loggableError(err),
      );
    }
  }
  // Ordered so card matching never depends on physical row order.
  const cardList = plaidAccounts.length > 0 ? await db.select().from(cards).orderBy(cards.id) : [];
  // Committed before the sync transaction opens; failures are the known-account
  // guard's problem.
  await storeAccounts(plaidAccounts, item.itemId, cardList);

  const { added, modified, removed, cursor } = await syncTransactions(accessToken, item.cursor, {
    notReadyRetries: options?.notReadyRetries,
  });

  let skipped = 0;
  let outcome = { consecutiveSkippedSyncs: 0, dropped: false };
  await db.transaction(async (tx) => {
    const upserts = [...added, ...modified];
    const knownAccountIds = await knownAccountIdsFor(tx, upserts);
    // The carry must resolve before the pending rows are deleted below.
    const carried = await resolveCarriedSelections(tx, added);
    skipped = await upsertTransactions(tx, item.itemId, upserts, knownAccountIds, carried);

    const removedIds = removed
      .map((r) => r.transaction_id)
      .filter((id): id is string => Boolean(id));
    if (removedIds.length > 0) {
      await tx.delete(transactions).where(inArray(transactions.transactionId, removedIds));
    }

    outcome = await recordSyncOutcome(tx, item.itemId, skipped, cursor);
  });

  // On a drop this log line is the only lasting record of what was lost.
  if (skipped > 0) {
    if (outcome.dropped) {
      console.error(
        `sync ${item.itemId}: ${skipped} transaction(s) reference accounts that are not stored — held back for ${MAX_SKIPPED_SYNCS - 1} syncs and now DROPPED, cursor advanced; these rows are gone (see the per-row lines above for the accounts)`,
      );
    } else {
      console.warn(
        `sync ${item.itemId}: ${skipped} transaction(s) reference accounts that are not stored — cursor held back, this batch will be re-offered on the next sync (${MAX_SKIPPED_SYNCS - outcome.consecutiveSkippedSyncs} more before it is dropped)`,
      );
    }
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
