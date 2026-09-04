import { desc, isNull } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { cardCategories, cards, creditCategories } from '@/db/schema';
import { db } from '@/lib/db';
import { errorResponse } from '@/lib/errors';

export async function GET() {
  try {
    // Only what can currently be picked. Retired rows (the seed stamps
    // `retired_at` instead of deleting — see src/db/schema.ts) stay in their
    // tables so old transactions keep their links, but they are not offered:
    // a picker must not list a category the card no longer has. A saved
    // category that is retired still renders on the account page by name,
    // because GET /api/transactions resolves names by join, not from here.
    //
    // Ordered so the pickers these feed keep a stable option order across
    // reloads — an unordered scan can shift after a seed reconcile. Card
    // categories lead with the best-earning ones (ties broken alphabetically);
    // credit categories have no rate, so they go alphabetically.
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
