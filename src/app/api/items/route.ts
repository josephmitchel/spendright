import { getTableColumns } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { items } from '@/db/schema';
import { db } from '@/lib/db';
import type { ItemsPayload } from '@/lib/api-types';
import { errorResponse } from '@/lib/errors';

// Exclude the encrypted access token from the response.
// Design: access-tokens-encrypted.
const { accessToken: _accessToken, ...publicColumns } = getTableColumns(items);

export async function GET() {
  try {
    const rows = await db.select(publicColumns).from(items);
    return NextResponse.json<ItemsPayload>({ items: rows });
  } catch (err) {
    return errorResponse(err);
  }
}
