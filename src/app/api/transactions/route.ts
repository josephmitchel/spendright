import { desc, eq, getTableColumns, sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { cardCategories, creditCategories, transactions } from '@/db/schema';
import { db } from '@/lib/db';
import type { TransactionsPayload } from '@/lib/api-types';
import { badRequest, errorResponse } from '@/lib/errors';

export async function GET(req: NextRequest) {
  try {
    // Trimmed before filtering so a padded id can never pass validation and
    // then silently match nothing.
    const accountId = req.nextUrl.searchParams.get('accountId')?.trim();
    if (!accountId) {
      return badRequest('accountId is required');
    }

    // Bounds are truncated to integers and clamped, never rejected. Absent,
    // non-numeric and zero all take the fallback; ±Infinity clamps to the
    // edge. Design: query-bounds-clamped.
    const readBound = (name: string, fallback: number, min: number, max: number) => {
      const parsed = Math.trunc(Number(req.nextUrl.searchParams.get(name)));
      if (Number.isNaN(parsed) || parsed === 0) return fallback;
      return Math.min(Math.max(parsed, min), max);
    };
    const limit = readBound('limit', 500, 1, 1000);
    // MAX_SAFE_INTEGER: the largest integer that survives the bigint bind intact.
    const offset = readBound('offset', 0, 0, Number.MAX_SAFE_INTEGER);

    // Every column except the raw Plaid payload. Design: raw-plaid-payload-stored-not-served.
    const { plaidTransaction: _plaidTransaction, ...transactionColumns } =
      getTableColumns(transactions);

    const rows = await db
      .select({
        ...transactionColumns,
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

    // The account's total row count. A separate query rather than a window
    // function, which returns nothing on an empty page.
    const [countRow] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(transactions)
      .where(eq(transactions.accountId, accountId));
    const total = countRow?.total ?? 0;

    return NextResponse.json<TransactionsPayload>({ transactions: rows, total, limit, offset });
  } catch (err) {
    return errorResponse(err);
  }
}
