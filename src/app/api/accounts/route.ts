import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { accounts } from '@/db/schema';
import { db } from '@/lib/db';
import { errorResponse } from '@/lib/errors';

export async function GET(req: NextRequest) {
  try {
    const itemId = req.nextUrl.searchParams.get('itemId');
    const accountId = req.nextUrl.searchParams.get('accountId');
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
