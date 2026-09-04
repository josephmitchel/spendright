import { desc } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { cardCategories, cards, creditCategories } from '@/db/schema';
import { db } from '@/lib/db';
import { errorResponse } from '@/lib/errors';

export async function GET() {
  try {
    // Ordered so the pickers these feed keep a stable option order across
    // reloads — an unordered scan can shift after a seed reconcile. Card
    // categories lead with the best-earning ones (ties broken alphabetically);
    // credit categories have no rate, so they go alphabetically.
    const [cardRows, categoryRows, creditCategoryRows] = await Promise.all([
      db.select().from(cards).orderBy(cards.name),
      db.select().from(cardCategories).orderBy(desc(cardCategories.rate), cardCategories.name),
      db.select().from(creditCategories).orderBy(creditCategories.name),
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
