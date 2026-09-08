import { desc, eq, getTableColumns, sql } from 'drizzle-orm';
import { cardCategories, creditCategories, transactions, type TransactionRow } from '@/db/schema';
import { db } from '@/lib/db';

// Design: raw-plaid-payload-stored-not-served.
const { plaidTransaction: _plaidTransaction, ...servedTransactionColumns } =
  getTableColumns(transactions);
export { servedTransactionColumns };

export type CategorizedTransaction = Pick<
  TransactionRow,
  keyof typeof servedTransactionColumns & keyof TransactionRow
> & {
  cardCategoryName: string | null;
  creditCategoryName: string | null;
};

// Design: list-endpoints-ordered, transactions-paginated.
export async function listTransactions(
  accountId: string,
  limit: number,
  offset: number,
): Promise<{ transactions: CategorizedTransaction[]; total: number }> {
  const rows = await db
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
    .offset(offset);

  const [countRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(transactions)
    .where(eq(transactions.accountId, accountId));

  return { transactions: rows, total: countRow?.total ?? 0 };
}
