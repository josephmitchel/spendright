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
    const upserts = [...added, ...modified];
    for (const txn of upserts) {
      const row = toTransactionRow(txn, item.itemId);
      await tx
        .insert(transactions)
        .values(row)
        .onConflictDoUpdate({
          target: transactions.transactionId,
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
