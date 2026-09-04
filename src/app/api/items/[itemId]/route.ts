import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { items } from '@/db/schema';
import { decrypt } from '@/lib/crypto';
import { db } from '@/lib/db';
import { errorResponse, plaidErrorBody } from '@/lib/errors';
import { itemRemove } from '@/lib/plaid';

// Unauthenticated and destructive. Design: single-user-localhost-no-auth.
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

    // Plaid already having forgotten the item is not a failure.
    try {
      await itemRemove(decrypt(item.accessToken));
    } catch (err) {
      if (plaidErrorBody(err)?.error_code !== 'ITEM_NOT_FOUND') throw err;
    }

    await db.delete(items).where(eq(items.itemId, itemId));
    return NextResponse.json({ deleted: itemId });
  } catch (err) {
    return errorResponse(err);
  }
}
