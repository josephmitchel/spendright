// Sync bookkeeping on the item row: cursor, skip counter, and stored error.
// Design: bounded-cursor-hold, accounts-refreshed-per-sync.
import { eq, sql } from 'drizzle-orm';
import { items } from '@/db/schema';
import { db, type DbTransaction } from '@/lib/db';
import { publicErrorMessage } from '@/lib/errors';
import { logError } from '@/lib/log';
import { plaidErrorBody } from '@/lib/plaid-errors';
import { MAX_SKIPPED_SYNCS, skippedItemErrorMessage } from '@/lib/sync-messages';

// Records a sync failure on the item row (best-effort — the caller's flow
// must finish either way) and returns the user-facing message.
// Design: error-message-allow-list.
export async function recordSyncFailure(
  itemId: string,
  err: unknown,
  fallback: string,
): Promise<string> {
  const message = publicErrorMessage(err, fallback);
  const plaidError = plaidErrorBody(err);
  try {
    await db
      .update(items)
      // { message } is the non-Plaid shape of items.error.
      .set({ error: plaidError ?? { message }, updatedAt: sql`now()` })
      .where(eq(items.itemId, itemId));
  } catch (writeErr) {
    logError(`Could not record the sync failure for item ${itemId}:`, writeErr);
  }
  return message;
}

// Stored on items.error when the account refresh failed; cleared by the next
// fully clean sync. Design: accounts-refreshed-per-sync.
export const ACCOUNT_REFRESH_FAILED_MESSAGE =
  'The account refresh failed on the last sync — balances may be stale (check the server ' +
  'log). Transactions still synced.';

// Cursor/skip-counter/error bookkeeping on the item row. The counter is read
// under lock, not from the caller's possibly stale ItemRow; the cursor
// advances only on a clean sync or a drop.
// Design: bounded-cursor-hold, accounts-refreshed-per-sync.
export async function recordSyncOutcome(
  tx: DbTransaction,
  itemId: string,
  skipped: number,
  cursor: string | null,
  accountRefreshFailed: boolean,
): Promise<{ consecutiveSkippedSyncs: number; dropped: boolean }> {
  const [itemState] = await tx
    .select({ skippedSyncs: items.skippedSyncs })
    .from(items)
    .where(eq(items.itemId, itemId))
    .for('update');
  // No row: the item was deleted while this sync ran; throwing records a
  // failure instead of reporting a clean outcome for a row never written.
  if (!itemState) throw new Error(`sync ${itemId}: item row disappeared mid-sync`);
  const consecutiveSkippedSyncs = skipped === 0 ? 0 : itemState.skippedSyncs + 1;
  const dropped = consecutiveSkippedSyncs >= MAX_SKIPPED_SYNCS;

  await tx
    .update(items)
    .set({
      ...(skipped === 0 || dropped ? { cursor } : {}),
      skippedSyncs: dropped ? 0 : consecutiveSkippedSyncs,
      // The skip message wins over the refresh one: held/dropped rows are the
      // more actionable state, and the refresh failure is still in the log.
      error:
        skipped > 0
          ? { message: skippedItemErrorMessage(skipped, consecutiveSkippedSyncs, dropped) }
          : accountRefreshFailed
            ? { message: ACCOUNT_REFRESH_FAILED_MESSAGE }
            : null,
      updatedAt: sql`now()`,
    })
    .where(eq(items.itemId, itemId));

  return { consecutiveSkippedSyncs, dropped };
}
