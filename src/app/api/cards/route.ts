import { NextResponse } from 'next/server';
import type { CardsPayload } from '@/lib/api-types';
import { listOfferedCards } from '@/lib/card-catalog';
import { db } from '@/lib/db';
import { errorResponse } from '@/lib/errors';

export async function GET() {
  try {
    const { cards, creditCategories } = await listOfferedCards(db);
    return NextResponse.json<CardsPayload>({ cards, creditCategories });
  } catch (err) {
    return errorResponse(err);
  }
}
