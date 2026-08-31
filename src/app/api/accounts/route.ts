import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { accounts } from '@/db/schema';
import { db } from '@/lib/db';
import { errorResponse } from '@/lib/errors';

export async function GET(req: NextRequest) {
  try {
    const itemId = req.nextUrl.searchParams.get('itemId');
    const rows = itemId
      ? await db.select().from(accounts).where(eq(accounts.itemId, itemId))
      : await db.select().from(accounts);
    return NextResponse.json({ accounts: rows });
  } catch (err) {
    return errorResponse(err);
  }
}
