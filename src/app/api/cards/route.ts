import { NextResponse } from 'next/server';
import { cardCategories, cards } from '@/db/schema';
import { db } from '@/lib/db';
import { errorResponse } from '@/lib/errors';

export async function GET() {
  try {
    const [cardRows, categoryRows] = await Promise.all([
      db.select().from(cards),
      db.select().from(cardCategories),
    ]);
    const result = cardRows.map((card) => ({
      ...card,
      categories: categoryRows.filter((category) => category.cardId === card.id),
    }));
    return NextResponse.json({ cards: result });
  } catch (err) {
    return errorResponse(err);
  }
}
