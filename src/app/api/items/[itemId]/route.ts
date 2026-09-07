import { eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { items } from '@/db/schema';
import type { ItemDeleteResponse } from '@/lib/api-types';
import { decrypt } from '@/lib/crypto';
import { db } from '@/lib/db';
import { jsonError, withErrorResponse } from '@/lib/errors';
import { logError } from '@/lib/log';
import { removeItem } from '@/lib/plaid';
import { plaidErrorBody } from '@/lib/plaid-errors';
import { PublicError } from '@/lib/public-error';

// Design: single-user-localhost-no-auth.
export const DELETE = withErrorResponse(
  async (_req: NextRequest, { params }: { params: Promise<{ itemId: string }> }) => {
    const { itemId } = await params;
    const [item] = await db.select().from(items).where(eq(items.itemId, itemId));
    if (!item) {
      return jsonError('NOT_FOUND', 'Item not found', 404);
    }

    // Design: item-delete-plaid-first.
    let accessToken: string | null = null;
    try {
      accessToken = decrypt(item.accessToken);
    } catch (err) {
      if (!(err instanceof PublicError)) throw err;
      logError('item delete: token unreadable, skipping Plaid revoke:', err);
    }

    if (accessToken !== null) {
      try {
        await removeItem(accessToken);
      } catch (err) {
        if (plaidErrorBody(err)?.error_code !== 'ITEM_NOT_FOUND') throw err;
      }
    }

    await db.delete(items).where(eq(items.itemId, itemId));
    return NextResponse.json<ItemDeleteResponse>({ deleted: itemId });
  },
);
