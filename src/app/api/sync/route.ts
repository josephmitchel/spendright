import { eq, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { items } from '@/db/schema';
import { db } from '@/lib/db';
import { errorResponse } from '@/lib/errors';
import { syncItem, type SyncItemResult } from '@/lib/sync';

export async function POST() {
  try {
    const allItems = await db.select().from(items);
    const results: Array<SyncItemResult | { itemId: string; error: string }> = [];

    for (const item of allItems) {
      try {
        results.push(await syncItem(item));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'sync failed';
        console.error(`Sync failed for item ${item.itemId}:`, err);
        const plaidError =
          (err as { response?: { data?: unknown } })?.response?.data ?? { message };
        await db
          .update(items)
          .set({ error: plaidError, updatedAt: sql`now()` })
          .where(eq(items.itemId, item.itemId));
        results.push({ itemId: item.itemId, error: message });
      }
    }

    return NextResponse.json({ results });
  } catch (err) {
    return errorResponse(err);
  }
}
