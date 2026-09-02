import { desc, eq, getTableColumns } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { cardCategories, transactions } from '@/db/schema';
import { db } from '@/lib/db';
import { errorResponse } from '@/lib/errors';

export async function GET(req: NextRequest) {
  try {
    const accountId = req.nextUrl.searchParams.get('accountId');
    if (!accountId) {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'accountId is required' } },
        { status: 400 },
      );
    }

    const limit = Math.min(Number(req.nextUrl.searchParams.get('limit')) || 500, 1000);
    const offset = Number(req.nextUrl.searchParams.get('offset')) || 0;

    const rows = await db
      .select({ ...getTableColumns(transactions), cardCategoryName: cardCategories.name })
      .from(transactions)
      .leftJoin(cardCategories, eq(transactions.cardCategoryId, cardCategories.id))
      .where(eq(transactions.accountId, accountId))
      .orderBy(desc(transactions.date), desc(transactions.id))
      .limit(limit)
      .offset(offset);

    return NextResponse.json({ transactions: rows });
  } catch (err) {
    return errorResponse(err);
  }
}
