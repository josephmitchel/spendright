import { eq, sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { items } from '@/db/schema';
import { db } from '@/lib/db';
import { errorResponse, plaidErrorBody, publicErrorMessage } from '@/lib/errors';
import { syncItem } from '@/lib/sync';
import { verifyPlaidWebhook } from '@/lib/webhook';

// The automatic sync path: Plaid announces new transactions and this route
// syncs the named item. Every request is verified before its body is trusted.
// Design: automatic-sync, webhook-triggered-sync, webhook-jwt-verification.
export async function POST(req: NextRequest) {
  try {
    // Raw text first: verification hashes the exact bytes Plaid signed.
    const rawBody = await req.text();
    await verifyPlaidWebhook(rawBody, req.headers.get('plaid-verification'));

    // A verified request came from Plaid, and Plaid re-delivers on any
    // non-2xx, so a malformed body is acknowledged rather than rejected —
    // a 400 would only replay the same body forever.
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      console.warn('webhook: verified request body is not JSON — acknowledged and ignored');
      return NextResponse.json({ acknowledged: true, synced: false });
    }
    const { webhook_type, webhook_code, item_id } = (body ?? {}) as {
      webhook_type?: unknown;
      webhook_code?: unknown;
      item_id?: unknown;
    };

    // Only SYNC_UPDATES_AVAILABLE triggers work. The legacy transactions codes
    // (INITIAL_UPDATE, HISTORICAL_UPDATE, DEFAULT_UPDATE) announce the same
    // news and arrive alongside it, so acting on them too would double-sync;
    // everything else (ITEM errors and the like) is Plaid's to re-raise on the
    // next sync. All are acknowledged so Plaid does not re-deliver.
    if (webhook_type !== 'TRANSACTIONS' || webhook_code !== 'SYNC_UPDATES_AVAILABLE') {
      console.log(
        `webhook: acknowledged ${String(webhook_type)}/${String(webhook_code)} without syncing`,
      );
      return NextResponse.json({ acknowledged: true, synced: false });
    }
    if (typeof item_id !== 'string' || !item_id) {
      console.warn('webhook: SYNC_UPDATES_AVAILABLE without an item_id — acknowledged and ignored');
      return NextResponse.json({ acknowledged: true, synced: false });
    }

    const [item] = await db.select().from(items).where(eq(items.itemId, item_id));
    if (!item) {
      // Plaid can keep announcing an item removed here; a 200 stops the retries.
      console.warn(`webhook: item ${item_id} is not stored — acknowledged and ignored`);
      return NextResponse.json({ acknowledged: true, synced: false });
    }

    // Inline, like every other sync path (design: inline-initial-sync); an
    // incremental sync is small and Plaid's delivery tolerates the wait.
    try {
      const result = await syncItem(item);
      return NextResponse.json({ acknowledged: true, synced: true, result });
    } catch (err) {
      console.error(`webhook sync failed for item ${item_id}:`, err);
      const message = publicErrorMessage(err, 'Sync failed — check the server log');
      const plaidError = plaidErrorBody(err);
      // Same allow-list and best-effort write as POST /api/sync. Still a 200:
      // the failure is recorded and the cursor did not advance, so the next
      // webhook or manual sync retries; a non-2xx would only make Plaid
      // re-deliver news the app has already acted on.
      try {
        await db
          .update(items)
          .set({ error: plaidError ?? { message }, updatedAt: sql`now()` })
          .where(eq(items.itemId, item_id));
      } catch (writeErr) {
        console.error(`Could not record the webhook sync failure for item ${item_id}:`, writeErr);
      }
      return NextResponse.json({ acknowledged: true, synced: false, error: message });
    }
  } catch (err) {
    return errorResponse(err);
  }
}
