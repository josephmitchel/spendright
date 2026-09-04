import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { items } from '@/db/schema';
import { decrypt } from '@/lib/crypto';
import { db } from '@/lib/db';
import { errorResponse } from '@/lib/errors';
import { itemRemove } from '@/lib/plaid';

// Unauthenticated, like every route here, and this is the destructive one:
// anything that can reach it can delete an institution with all of its accounts
// and transactions. Deliberate for a localhost single-user tool — see the
// "BEFORE DEPLOYING" note at the top of src/app/api/exchange/route.ts, which is
// where that decision is recorded.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  try {
    const { itemId } = await params;
    const [item] = await db.select().from(items).where(eq(items.itemId, itemId));
    if (!item) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Item not found' } },
        { status: 404 },
      );
    }

    try {
      await itemRemove(decrypt(item.accessToken));
    } catch (err) {
      const code = (err as { response?: { data?: { error_code?: string } } })?.response?.data
        ?.error_code;
      if (code !== 'ITEM_NOT_FOUND') throw err;
    }

    await db.delete(items).where(eq(items.itemId, itemId));
    return NextResponse.json({ deleted: itemId });
  } catch (err) {
    return errorResponse(err);
  }
}
