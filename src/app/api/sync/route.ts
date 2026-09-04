import { eq, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { items } from '@/db/schema';
import { db } from '@/lib/db';
import { errorResponse, plaidErrorBody, publicErrorMessage } from '@/lib/errors';
import { syncItem, type SyncItemResult } from '@/lib/sync';

export async function POST() {
  try {
    const allItems = await db.select().from(items);
    const results: Array<SyncItemResult | { itemId: string; error: string }> = [];

    for (const item of allItems) {
      try {
        results.push(await syncItem(item));
      } catch (err) {
        console.error(`Sync failed for item ${item.itemId}:`, err);
        // Never surface err.message here, for the reason errorResponse doesn't
        // either (src/lib/errors.ts): drizzle wraps every query failure in a
        // DrizzleQueryError whose message is the full SQL plus the bound
        // parameters — for a syncItem failure that is the transactions upsert,
        // so the statement, the account ids and the raw Plaid transaction JSON.
        // This route bypasses errorResponse, so hardening that function alone
        // left the invariant holding on only half the paths.
        //
        // It leaks twice over, and the second one is the reason this matters
        // more here than in a response body: the message goes into
        // results[].error, which the home page shows in its sync status, AND
        // into items.error, which the home page re-renders as "Item error: …"
        // on EVERY load until a later sync succeeds and clears it. A stored
        // leak outlives the request that produced it.
        //
        // The exceptions are the two errorResponse allows, applied through the
        // shared helper so a failure reads the same way here as it would in a
        // response: Plaid's own error body (written to be shown, and what makes
        // an ITEM_LOGIN_REQUIRED actionable instead of just "sync failed"), and
        // a PublicError the app raised deliberately.
        const message = publicErrorMessage(err, 'Sync failed — check the server log');
        // The stored value keeps Plaid's whole body when there is one — its
        // error_code is what a reader needs to tell ITEM_LOGIN_REQUIRED from a
        // rate limit — and otherwise just the message decided above.
        const plaidError = plaidErrorBody(err);
        // Guarded for the same reason as the one in /api/exchange, with a
        // different blast radius: unguarded, a failed write here escapes the
        // per-item catch, aborts the loop and returns a 500 carrying no results
        // at all — so the items that DID sync are reported as a total failure,
        // and since their cursors are committed the next run reports "+0 added"
        // and their work is never attributed. Recording an error is best-effort;
        // finishing the loop is not.
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
