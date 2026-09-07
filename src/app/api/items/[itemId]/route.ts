import { eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { items } from '@/db/schema';
import type { ItemDeleteResponse } from '@/lib/api-types';
import { decrypt } from '@/lib/crypto';
import { db } from '@/lib/db';
import { jsonError, withErrorResponse } from '@/lib/errors';
import { removeItem } from '@/lib/plaid';
import { plaidErrorBody } from '@/lib/plaid-errors';

// Unauthenticated and destructive. Design: single-user-localhost-no-auth.
export const DELETE = withErrorResponse(
  async (_req: NextRequest, { params }: { params: Promise<{ itemId: string }> }) => {
    const { itemId } = await params;
    const [item] = await db.select().from(items).where(eq(items.itemId, itemId));
    if (!item) {
      return jsonError('NOT_FOUND', 'Item not found', 404);
    }

    // Plaid already having forgotten the item is not a failure.
    try {
      await removeItem(decrypt(item.accessToken));
    } catch (err) {
      if (plaidErrorBody(err)?.error_code !== 'ITEM_NOT_FOUND') throw err;
    }

    await db.delete(items).where(eq(items.itemId, itemId));
    return NextResponse.json<ItemDeleteResponse>({ deleted: itemId });
  },
);
