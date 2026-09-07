import { NextResponse } from 'next/server';
import { items } from '@/db/schema';
import type { ItemsPayload } from '@/lib/api-types';
import { db } from '@/lib/db';
import { withErrorResponse } from '@/lib/errors';
import { publicItemColumns } from '@/lib/items';

export const GET = withErrorResponse(async () => {
  // The pick excludes the encrypted access token (src/lib/items.ts).
  // Design: access-tokens-encrypted.
  // Ordered by id (creation order) so sections don't reshuffle under the
  // poll. Design: list-endpoints-ordered.
  const rows = await db.select(publicItemColumns).from(items).orderBy(items.id);
  return NextResponse.json<ItemsPayload>({ items: rows });
});
