import { items } from '@/db/schema';
import { singleFlight } from '@/lib/async-coordination';
import { db } from '@/lib/db';
import { publicErrorMessage } from '@/lib/errors';
import { globalSingleton } from '@/lib/global-singleton';
import { logError } from '@/lib/log';
import { POOL_CONFIG } from '@/lib/pool-config';
import { syncItem, type SyncItemResult } from '@/lib/sync';
import { recordSyncFailure } from '@/lib/sync-outcome';
import { recordLastSync, type SyncTrigger } from '@/lib/sync-status';

interface SyncItemFailure {
  itemId: string;
  institutionName: string | null;
  error: string;
}
export type SyncAllResult = Array<SyncItemResult | SyncItemFailure>;

const syncAllSlot = globalSingleton('syncAllInFlight', () => ({
  inFlight: null as Promise<SyncAllResult> | null,
}));

export function syncAllItems(trigger: SyncTrigger): Promise<SyncAllResult> {
  return singleFlight(syncAllSlot, () => runSyncAll(trigger));
}

// Bounded well below the pool max: each in-flight item holds up to two pool
// connections — its dedicated lock session plus the transaction that commits
// its batch. Per-item correctness comes from the item locks, not ordering.
const SYNC_CONCURRENCY = 3;
if (SYNC_CONCURRENCY * 2 > POOL_CONFIG.max) {
  throw new Error(
    `SYNC_CONCURRENCY (${SYNC_CONCURRENCY}) needs ${SYNC_CONCURRENCY * 2} pool connections but ` +
      `POOL_CONFIG.max is ${POOL_CONFIG.max} — revisit both together`,
  );
}

async function runSyncAll(trigger: SyncTrigger): Promise<SyncAllResult> {
  let allItems: Array<{ itemId: string; institutionName: string | null }>;
  try {
    allItems = await db
      .select({ itemId: items.itemId, institutionName: items.institutionName })
      .from(items);
  } catch (err) {
    // A failure this early has no item row to carry it — record it globally.
    recordLastSync(publicErrorMessage(err, 'Sync failed — check the server log'), trigger);
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

  recordLastSync(null, trigger);
  return results;
}
