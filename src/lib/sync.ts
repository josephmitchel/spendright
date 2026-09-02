import { eq, inArray, sql } from 'drizzle-orm';
import { Transaction as PlaidTransaction } from 'plaid';
import { items, transactions, type ItemRow } from '@/db/schema';
import { decrypt } from '@/lib/crypto';
import { db } from '@/lib/db';
import { syncTransactions } from '@/lib/plaid';

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
}

export async function syncItem(item: ItemRow): Promise<SyncItemResult> {
  const accessToken = decrypt(item.accessToken);
  const { added, modified, removed, cursor } = await syncTransactions(accessToken, item.cursor);

  await db.transaction(async (tx) => {
    // Plaid replaces a pending transaction with a posted one under a NEW
    // transaction_id (old id in `removed`, new one in `added` with
    // pending_transaction_id set). Carry the user's category/rate over
    // before the pending row is deleted below.
    const pendingIds = added
      .map((txn) => txn.pending_transaction_id)
      .filter((id): id is string => Boolean(id));
    const carried = new Map<string, { cardCategoryId: number | null; rewardRate: string | null }>();
    if (pendingIds.length > 0) {
      const pendingRows = await tx
        .select({
          transactionId: transactions.transactionId,
          cardCategoryId: transactions.cardCategoryId,
          rewardRate: transactions.rewardRate,
        })
        .from(transactions)
        .where(inArray(transactions.transactionId, pendingIds));
      for (const row of pendingRows) {
        if (row.cardCategoryId !== null || row.rewardRate !== null) {
          carried.set(row.transactionId, {
            cardCategoryId: row.cardCategoryId,
            rewardRate: row.rewardRate,
          });
        }
      }
    }

    const upserts = [...added, ...modified];
    for (const txn of upserts) {
      const row = toTransactionRow(txn, item.itemId);
      const carry = txn.pending_transaction_id
        ? carried.get(txn.pending_transaction_id)
        : undefined;
      await tx
        .insert(transactions)
        .values(carry ? { ...row, ...carry } : row)
        .onConflictDoUpdate({
          target: transactions.transactionId,
          // `set` deliberately excludes cardCategoryId/rewardRate so re-syncs
          // never overwrite a user's existing selection.
          set: { ...row, updatedAt: sql`now()` },
        });
    }

    const removedIds = removed
      .map((r) => r.transaction_id)
      .filter((id): id is string => Boolean(id));
    if (removedIds.length > 0) {
      await tx.delete(transactions).where(inArray(transactions.transactionId, removedIds));
    }

    await tx
      .update(items)
      .set({ cursor, error: null, updatedAt: sql`now()` })
      .where(eq(items.itemId, item.itemId));
  });

  return {
    itemId: item.itemId,
    added: added.length,
    modified: modified.length,
    removed: removed.length,
  };
}
