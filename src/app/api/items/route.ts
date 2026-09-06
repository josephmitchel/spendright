import { NextResponse } from 'next/server';
import { items } from '@/db/schema';
import type { ItemsPayload } from '@/lib/api-types';
import { db } from '@/lib/db';
import { errorResponse } from '@/lib/errors';
import { publicItemColumns } from '@/lib/items';

export async function GET() {
  try {
    // The pick excludes the encrypted access token; its single definition
    // (and the served type derived from it) live in src/lib/items.ts.
    // Design: access-tokens-encrypted.
    const rows = await db.select(publicItemColumns).from(items);
    return NextResponse.json<ItemsPayload>({ items: rows });
  } catch (err) {
    return errorResponse(err);
  }
}
