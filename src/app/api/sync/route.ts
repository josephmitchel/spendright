import { eq, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { items } from '@/db/schema';
import { db } from '@/lib/db';
import { errorResponse, plaidErrorBody, publicErrorMessage } from '@/lib/errors';
import { loggableError } from '@/lib/log';
import { syncItem, type SyncItemResult } from '@/lib/sync';

export async function POST() {
  try {
    const allItems = await db.select().from(items);
    const results: Array<SyncItemResult | { itemId: string; error: string }> = [];

    for (const item of allItems) {
      try {
        results.push(await syncItem(item));
      } catch (err) {
        console.error(`Sync failed for item ${item.itemId}:`, loggableError(err));
        // The message is stored on the item row and shown on every load, so it
        // goes through the allow-list. Design: error-message-allow-list.
        const message = publicErrorMessage(err, 'Sync failed — check the server log');
        const plaidError = plaidErrorBody(err);
        // Recording the failure is best-effort; the loop must finish either way.
        try {
          await db
            .update(items)
            .set({ error: plaidError ?? { message }, updatedAt: sql`now()` })
            .where(eq(items.itemId, item.itemId));
        } catch (writeErr) {
          console.error(`Could not record the sync failure for item ${item.itemId}:`, writeErr);
        }
        results.push({ itemId: item.itemId, error: message });
      }
    }

    return NextResponse.json({ results });
  } catch (err) {
    return errorResponse(err);
  }
}
