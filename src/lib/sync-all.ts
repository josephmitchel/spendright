import { items } from '@/db/schema';
import { singleFlight } from '@/lib/async-coordination';
import { db } from '@/lib/db';
import { publicErrorMessage } from '@/lib/errors';
import { globalSingleton } from '@/lib/global-singleton';
import { logError } from '@/lib/log';
import { syncItem, type SyncItemResult } from '@/lib/sync';
import { recordSyncFailure } from '@/lib/sync-outcome';
import { recordLastSync } from '@/lib/sync-status';

// Design: scheduled-sync.

export interface SyncItemFailure {
  itemId: string;
  institutionName: string | null;
  error: string;
}
export type SyncAllResult = Array<SyncItemResult | SyncItemFailure>;

const syncAllSlot = globalSingleton('syncAllInFlight', () => ({
  inFlight: null as Promise<SyncAllResult> | null,
}));

export function syncAllItems(): Promise<SyncAllResult> {
  return singleFlight(syncAllSlot, runSyncAll);
}

// Bounded well below the pool max (10): each in-flight item holds a dedicated
// lock client. Per-item correctness comes from the item locks, not ordering.
const SYNC_CONCURRENCY = 3;

async function runSyncAll(): Promise<SyncAllResult> {
  let allItems: Array<{ itemId: string; institutionName: string | null }>;
  try {
    allItems = await db
      .select({ itemId: items.itemId, institutionName: items.institutionName })
      .from(items);
  } catch (err) {
    // A failure this early has no item row to carry it — record it globally.
    recordLastSync(publicErrorMessage(err, 'Sync failed — check the server log'));
    throw err;
  }

  const results: SyncAllResult = [];
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < allItems.length) {
      const index = nextIndex++;
      const item = allItems[index];
      if (!item) break;
      try {
        results[index] = await syncItem(item.itemId);
      } catch (err) {
        logError(`Sync failed for item ${item.itemId}:`, err);
        const message = await recordSyncFailure(
          item.itemId,
          err,
          'Sync failed — check the server log',
        );
        results[index] = {
          itemId: item.itemId,
          institutionName: item.institutionName,
          error: message,
        };
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(SYNC_CONCURRENCY, allItems.length) }, () => worker()),
  );

  recordLastSync(null);
  return results;
}
