import { desc, eq, sql } from 'drizzle-orm';
import { cardCategories, creditCategories, transactions } from '@/db/schema';
import { servedTransactionColumns, type CategorizedTransaction } from '@/lib/categories';
import { db } from '@/lib/db';

// One account's transaction page, newest first, with both joined category
// names; the kind not set is null by the sign constraint. `total` is the
// account's full row count — a separate query rather than a window function,
// which returns nothing on an empty page.
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
