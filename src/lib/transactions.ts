import { desc, eq, sql } from 'drizzle-orm';
import { cardCategories, creditCategories, transactions, type TransactionRow } from '@/db/schema';
import { db } from '@/lib/db';
import { servedTransactionColumns } from '@/lib/served-columns';

export { servedTransactionColumns };

export type CategorizedTransaction = Pick<
  TransactionRow,
  keyof typeof servedTransactionColumns & keyof TransactionRow
> & {
  cardCategoryName: string | null;
  creditCategoryName: string | null;
};

export async function listTransactions(
  accountId: string,
  limit: number,
  offset: number,
): Promise<{ transactions: CategorizedTransaction[]; total: number }> {
  const [rows, [countRow]] = await Promise.all([
    db
      .select({
        ...servedTransactionColumns,
        cardCategoryName: cardCategories.name,
        creditCategoryName: creditCategories.name,
      })
      .from(transactions)
      .leftJoin(cardCategories, eq(transactions.cardCategoryId, cardCategories.id))
      .leftJoin(creditCategories, eq(transactions.creditCategoryId, creditCategories.id))
      .where(eq(transactions.accountId, accountId))
      .orderBy(desc(transactions.date), desc(transactions.id))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(transactions)
      .where(eq(transactions.accountId, accountId)),
  ]);

  return { transactions: rows, total: countRow?.total ?? 0 };
}
