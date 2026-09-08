import { eq, sql } from 'drizzle-orm';
import { items } from '@/db/schema';
import { db, type DbTransaction } from '@/lib/db';
import { publicErrorMessage } from '@/lib/errors';
import { logError } from '@/lib/log';
import { plaidErrorBody } from '@/lib/plaid-errors';
import {
  ACCOUNT_REFRESH_FAILED_MESSAGE,
  MAX_SKIPPED_SYNCS,
  skippedItemErrorMessage,
} from '@/lib/sync-messages';

// Best-effort; returns the user-facing message.
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

// The skip counter is read under lock, not from the caller's possibly stale
// ItemRow.
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
  if (!itemState) throw new Error(`sync ${itemId}: item row disappeared mid-sync`);
  const consecutiveSkippedSyncs = skipped === 0 ? 0 : itemState.skippedSyncs + 1;
  const dropped = consecutiveSkippedSyncs >= MAX_SKIPPED_SYNCS;

  await tx
    .update(items)
    .set({
      ...(skipped === 0 || dropped ? { cursor } : {}),
      skippedSyncs: dropped ? 0 : consecutiveSkippedSyncs,
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
