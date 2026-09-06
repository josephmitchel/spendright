import { NextResponse } from 'next/server';
import type { CardsPayload } from '@/lib/api-types';
import { listOfferedCards } from '@/lib/card-catalog';
import { db } from '@/lib/db';
import { withErrorResponse } from '@/lib/errors';

export const GET = withErrorResponse(async () => {
  const { cards, creditCategories } = await listOfferedCards(db);
  return NextResponse.json<CardsPayload>({ cards, creditCategories });
});
