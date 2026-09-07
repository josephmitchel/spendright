import { desc, eq, getTableColumns, sql } from 'drizzle-orm';
import { cardCategories, creditCategories, transactions, type TransactionRow } from '@/db/schema';
import { db } from '@/lib/db';

// Every column except the raw Plaid payload; the served row type below is
// derived from this runtime pick.
// Design: raw-plaid-payload-stored-not-served.
const { plaidTransaction: _plaidTransaction, ...servedTransactionColumns } =
  getTableColumns(transactions);
export { servedTransactionColumns };

// The served row with both joined category names; the kind not written is
// null by the sign constraint, so no second lookup is made.
export type CategorizedTransaction = Pick<
  TransactionRow,
  keyof typeof servedTransactionColumns & keyof TransactionRow
> & {
  cardCategoryName: string | null;
  creditCategoryName: string | null;
};

// One account's transaction page, newest first. `total` is a separate query
// rather than a window function, which returns nothing on an empty page.
// Design: transaction-list-ordering, transactions-paginated,
// raw-plaid-payload-stored-not-served.
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
