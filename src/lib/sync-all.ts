import { items } from '@/db/schema';
import { db } from '@/lib/db';
import { loggableError } from '@/lib/log';
import { recordSyncFailure, syncItem, type SyncItemResult } from '@/lib/sync';

// The one sync-all runner, shared by the scheduler and POST /api/sync, and
// single-flight: a caller that arrives while a run is in progress joins that
// run instead of starting a duplicate whole-account pass. (The cursor-write
// invariant — no two concurrent syncItem calls on one item — is held by
// syncItem's own per-item lock in src/lib/sync.ts, which also covers the
// exchange route's inline initial sync.) The in-flight promise lives on
// globalThis because the bundler emits separate copies of this module for the
// route's static import and the scheduler's dynamic import (verified in the
// compiled chunks); a module-scope variable would be one guard per copy, not
// one per process. Design: scheduled-sync.

export type SyncAllResult = Array<SyncItemResult | { itemId: string; error: string }>;

const globalForSyncAll = globalThis as unknown as {
  syncAllInFlight?: Promise<SyncAllResult> | null;
};

export function syncAllItems(): Promise<SyncAllResult> {
  if (!globalForSyncAll.syncAllInFlight) {
    globalForSyncAll.syncAllInFlight = runSyncAll().finally(() => {
      globalForSyncAll.syncAllInFlight = null;
    });
  }
  return globalForSyncAll.syncAllInFlight;
}

async function runSyncAll(): Promise<SyncAllResult> {
  const allItems = await db.select().from(items);
  const results: SyncAllResult = [];

  for (const item of allItems) {
    try {
      results.push(await syncItem(item));
    } catch (err) {
      console.error(`Sync failed for item ${item.itemId}:`, loggableError(err));
      const message = await recordSyncFailure(
        item.itemId,
        err,
        'Sync failed — check the server log',
      );
      results.push({ itemId: item.itemId, error: message });
    }
  }

  return results;
}
