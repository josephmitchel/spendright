import { eq, sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { accounts, cardCategories, transactions } from '@/db/schema';
import { db } from '@/lib/db';
import { errorResponse } from '@/lib/errors';

function badRequest(message: string) {
  return NextResponse.json({ error: { code: 'BAD_REQUEST', message } }, { status: 400 });
}

// Set or clear a transaction's card spending category.
// Body: { cardCategoryId: number | null }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ transactionId: string }> },
) {
  try {
    const { transactionId } = await params;
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return badRequest('Request body must be valid JSON');
    }
    const raw = (body as { cardCategoryId?: unknown } | null)?.cardCategoryId;
    if (
      raw !== null &&
      !(typeof raw === 'number' && Number.isInteger(raw) && raw >= 1 && raw <= 2147483647)
    ) {
      return badRequest('cardCategoryId must be a positive integer or null');
    }
    const cardCategoryId = raw as number | null;

    const [transaction] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.transactionId, transactionId));
    if (!transaction) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Transaction not found' } },
        { status: 404 },
      );
    }

    let rewardRate: string | null = null;
    let categoryName: string | null = null;
    if (cardCategoryId !== null) {
      const [account] = await db
        .select()
        .from(accounts)
        .where(eq(accounts.accountId, transaction.accountId));
      if (!account?.cardId) {
        return badRequest('This account has no matched card definition');
      }
      const [category] = await db
        .select()
        .from(cardCategories)
        .where(eq(cardCategories.id, cardCategoryId));
      if (!category || category.cardId !== account.cardId) {
        return badRequest("cardCategoryId does not belong to this account's card");
      }
      rewardRate = category.rate;
      categoryName = category.name;
    }

    const [updated] = await db
      .update(transactions)
      .set({ cardCategoryId, rewardRate, updatedAt: sql`now()` })
      .where(eq(transactions.transactionId, transactionId))
      .returning();

    return NextResponse.json({ transaction: { ...updated, cardCategoryName: categoryName } });
  } catch (err) {
    return errorResponse(err);
  }
}
