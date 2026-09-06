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
import { upsertAccount } from '@/lib/accounts';
import { isInflowAmount } from '@/lib/amounts';
import { decrypt } from '@/lib/crypto';
import { loggableError } from '@/lib/log';
import { db } from '@/lib/db';
import { getAccounts, syncTransactions } from '@/lib/plaid';

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

// Consecutive syncs a cursor may be held back before the skipped rows are
// dropped. Design: bounded-cursor-hold
export const MAX_SKIPPED_SYNCS = 5;

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
// any one of them. Held on globalThis for the same reason as the sync-all
// guard: the bundler emits separate copies of this module per import graph.
// Design: scheduled-sync.
const globalForSyncItem = globalThis as unknown as {
  syncItemTails?: Map<string, Promise<void>>;
};

export function syncItem(item: ItemRow, options?: SyncItemOptions): Promise<SyncItemResult> {
  const tails = (globalForSyncItem.syncItemTails ??= new Map<string, Promise<void>>());
  const previous = tails.get(item.itemId) ?? Promise.resolve();
  const run = previous.then(() => runSyncItem(item, options));
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  tails.set(item.itemId, tail);
  tail.then(() => {
    if (tails.get(item.itemId) === tail) tails.delete(item.itemId);
  });
  return run;
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

  // Each account in its own transaction, committed before the sync transaction
  // opens, so one failing account costs only its own rows (handled by the
  // known-account guard below).
  for (const plaidAccount of plaidAccounts) {
    try {
      await db.transaction(async (tx) => {
        await upsertAccount(tx, plaidAccount, item.itemId, cardList);
      });
    } catch (err) {
      console.error(
        `sync ${item.itemId}: could not store account ${plaidAccount.account_id} — continuing:`,
        err,
      );
    }
  }

  const { added, modified, removed, cursor } = await syncTransactions(accessToken, item.cursor, {
    notReadyRetries: options?.notReadyRetries,
  });
  let skipped = 0;
  let dropped = false;
  let consecutiveSkippedSyncs = 0;

  await db.transaction(async (tx) => {
    // Guard for the transactions.account_id FK: a rejected insert would abort
    // the whole transaction, cursor included, and wedge the item. Must mirror
    // the FK exactly, so keyed on account_id alone (not item_id) and read from
    // the DB rather than from plaidAccounts. Design: bounded-cursor-hold
    const batchAccountIds = [...new Set([...added, ...modified].map((txn) => txn.account_id))];
    const knownAccountIds = new Set(
      batchAccountIds.length > 0
        ? (
            await tx
              .select({ accountId: accounts.accountId })
              .from(accounts)
              .where(inArray(accounts.accountId, batchAccountIds))
          ).map((row) => row.accountId)
        : [],
    );

    // Plaid reposts a pending transaction under a new id (old id in `removed`,
    // new one in `added` with pending_transaction_id). Carry the user's
    // selection over before the pending row is deleted below.
    // Design: pending-to-posted-carry
    const pendingIds = added
      .map((txn) => txn.pending_transaction_id)
      .filter((id): id is string => Boolean(id));
    const carried = new Map<
      string,
      { cardCategoryId: number | null; rewardRate: string | null; creditCategoryId: number | null }
    >();
    if (pendingIds.length > 0) {
      // Locked: a concurrent PATCH on a pending row would otherwise commit a
      // selection after this read decided there was nothing to carry, then lose
      // it when the row is deleted below. With the lock, PATCH blocks and gets
      // a 404 (row gone) or a 503 (lock timeout) instead of a false 200.
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

      // Only check that the category rows still exist: a carry is a fresh
      // insert, so a stale id would abort the whole sync.
      const pendingCardCategoryIds = [
        ...new Set(pendingRows.map((r) => r.cardCategoryId).filter((id) => id !== null)),
      ];
      const liveCardCategoryIds = new Set<number>();
      if (pendingCardCategoryIds.length > 0) {
        const categoryRows = await tx
          .select({ id: cardCategories.id })
          .from(cardCategories)
          .where(inArray(cardCategories.id, pendingCardCategoryIds));
        for (const category of categoryRows) liveCardCategoryIds.add(category.id);
      }
      const pendingCreditCategoryIds = [
        ...new Set(pendingRows.map((r) => r.creditCategoryId).filter((id) => id !== null)),
      ];
      const liveCreditCategoryIds = new Set<number>();
      if (pendingCreditCategoryIds.length > 0) {
        const creditRows = await tx
          .select({ id: creditCategories.id })
          .from(creditCategories)
          .where(inArray(creditCategories.id, pendingCreditCategoryIds));
        for (const category of creditRows) liveCreditCategoryIds.add(category.id);
      }

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
    }

    const upserts = [...added, ...modified];
    for (const txn of upserts) {
      if (!knownAccountIds.has(txn.account_id)) {
        skipped++;
        console.error(
          `sync ${item.itemId}: transaction ${txn.transaction_id} references unknown account ${txn.account_id} — skipped`,
        );
        continue;
      }
      const row = toTransactionRow(txn, item.itemId);
      const carry = txn.pending_transaction_id
        ? carried.get(txn.pending_transaction_id)
        : undefined;
      // Carry only the kind matching the posted amount's sign; a sign flip
      // drops the carry. Spend side carries on either column so an orphaned
      // rate survives. Design: category-kind-sign-rule
      const isInflow = isInflowAmount(row.amount);
      const carriedValues = isInflow
        ? carry?.creditCategoryId != null
          ? { creditCategoryId: carry.creditCategoryId }
          : null
        : carry?.cardCategoryId != null || carry?.rewardRate != null
          ? { cardCategoryId: carry.cardCategoryId, rewardRate: carry.rewardRate }
          : null;
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

    const removedIds = removed
      .map((r) => r.transaction_id)
      .filter((id): id is string => Boolean(id));
    if (removedIds.length > 0) {
      await tx.delete(transactions).where(inArray(transactions.transactionId, removedIds));
    }

    // Consecutive-skip counter, read under lock rather than from the caller's
    // possibly stale ItemRow. A clean sync or a drop resets it to 0.
    const [itemState] = await tx
      .select({ skippedSyncs: items.skippedSyncs })
      .from(items)
      .where(eq(items.itemId, item.itemId))
      .for('update');
    consecutiveSkippedSyncs = skipped === 0 ? 0 : (itemState?.skippedSyncs ?? 0) + 1;
    dropped = consecutiveSkippedSyncs >= MAX_SKIPPED_SYNCS;

    // Cursor advances only on a clean sync or a drop. items.error is written on
    // the first skip and cleared by a clean sync.
    await tx
      .update(items)
      .set({
        ...(skipped === 0 || dropped ? { cursor } : {}),
        skippedSyncs: dropped ? 0 : consecutiveSkippedSyncs,
        // { message } is the non-Plaid shape of items.error.
        error:
          skipped === 0
            ? null
            : {
                message: dropped
                  ? `${skipped} transaction(s) arrived for accounts that are not stored, for the ${MAX_SKIPPED_SYNCS}th consecutive sync. They have been dropped so this connection keeps syncing, and they cannot be recovered — check the server log for the accounts involved.`
                  : `${skipped} transaction(s) arrived for accounts that are not stored — they are being held and re-offered on every sync (${consecutiveSkippedSyncs} of ${MAX_SKIPPED_SYNCS}). If this line does not clear, the account cannot be stored: check the server log. On the ${MAX_SKIPPED_SYNCS}th consecutive sync they are dropped so the connection keeps working.`,
              },
        updatedAt: sql`now()`,
      })
      .where(eq(items.itemId, item.itemId));
  });

  // On a drop this log line is the only lasting record of what was lost.
  if (skipped > 0) {
    if (dropped) {
      console.error(
        `sync ${item.itemId}: ${skipped} transaction(s) reference accounts that are not stored — held back for ${MAX_SKIPPED_SYNCS - 1} syncs and now DROPPED, cursor advanced; these rows are gone (see the per-row lines above for the accounts)`,
      );
    } else {
      console.warn(
        `sync ${item.itemId}: ${skipped} transaction(s) reference accounts that are not stored — cursor held back, this batch will be re-offered on the next sync (${MAX_SKIPPED_SYNCS - consecutiveSkippedSyncs} more before it is dropped)`,
      );
    }
  }

  return {
    itemId: item.itemId,
    added: added.length,
    modified: modified.length,
    removed: removed.length,
    skipped,
    dropped,
  };
}
