import { items } from '@/db/schema';
import { singleFlight } from '@/lib/async-coordination';
import { db } from '@/lib/db';
import { globalSingleton } from '@/lib/global-singleton';
import { logError } from '@/lib/log';
import { syncItem, type SyncItemResult } from '@/lib/sync';
import { recordSyncFailure } from '@/lib/sync-outcome';

// Sync every item, single-flight: a caller arriving mid-run joins that run.
// The slot is a process-wide singleton because each bundled module graph
// evaluates its own copy (see src/lib/global-singleton.ts).
// Design: scheduled-sync.

export type SyncAllResult = Array<SyncItemResult | { itemId: string; error: string }>;

const syncAllSlot = globalSingleton('syncAllInFlight', () => ({
  inFlight: null as Promise<SyncAllResult> | null,
}));

export function syncAllItems(): Promise<SyncAllResult> {
  return singleFlight(syncAllSlot, runSyncAll);
}

async function runSyncAll(): Promise<SyncAllResult> {
  const allItems = await db.select().from(items);
  const results: SyncAllResult = [];

  for (const item of allItems) {
    try {
      results.push(await syncItem(item));
    } catch (err) {
      logError(`Sync failed for item ${item.itemId}:`, err);
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
