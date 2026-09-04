import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { accounts } from '@/db/schema';
import { db } from '@/lib/db';
import { errorResponse } from '@/lib/errors';

function badRequest(message: string) {
  return NextResponse.json({ error: { code: 'BAD_REQUEST', message } }, { status: 400 });
}

export async function GET(req: NextRequest) {
  try {
    const itemId = req.nextUrl.searchParams.get('itemId');
    const accountId = req.nextUrl.searchParams.get('accountId');
    // Absent means unfiltered; present-but-empty is a caller bug and is
    // rejected regardless of which filter wins. Design: query-bounds-clamped.
    if (accountId !== null && accountId.trim() === '') {
      return badRequest('accountId must not be empty');
    }
    if (itemId !== null && itemId.trim() === '') {
      return badRequest('itemId must not be empty');
    }
    const filter = accountId
      ? eq(accounts.accountId, accountId)
      : itemId
        ? eq(accounts.itemId, itemId)
        : undefined;
    const rows = await db.select().from(accounts).where(filter);
    return NextResponse.json({ accounts: rows });
  } catch (err) {
    return errorResponse(err);
  }
}
