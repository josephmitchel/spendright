import { desc, isNull } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { cardCategories, cards, creditCategories } from '@/db/schema';
import { db } from '@/lib/db';
import { errorResponse } from '@/lib/errors';

export async function GET() {
  try {
    // Retired rows are not offered. Design: categories-retired-not-deleted,
    // picker-ordering.
    const [cardRows, categoryRows, creditCategoryRows] = await Promise.all([
      db.select().from(cards).where(isNull(cards.retiredAt)).orderBy(cards.name),
      db
        .select()
        .from(cardCategories)
        .where(isNull(cardCategories.retiredAt))
        .orderBy(desc(cardCategories.rate), cardCategories.name),
      db
        .select()
        .from(creditCategories)
        .where(isNull(creditCategories.retiredAt))
        .orderBy(creditCategories.name),
    ]);
    const result = cardRows.map((card) => ({
      ...card,
      categories: categoryRows.filter((category) => category.cardId === card.id),
    }));
    return NextResponse.json({ cards: result, creditCategories: creditCategoryRows });
  } catch (err) {
    return errorResponse(err);
  }
}
