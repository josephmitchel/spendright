import { globalSingleton } from '@/lib/global-singleton';
import { logError, logInfo } from '@/lib/log';
import { syncAllItems } from '@/lib/sync-all';
import { isSyncFailure } from '@/lib/sync-failure';

// No webhook — the app has no internet-reachable origin.

const STARTUP_DELAY_MS = 10 * 1000;
const INTERVAL_MS = 60 * 60 * 1000;

const schedulerState = globalSingleton('syncScheduler', () => ({ started: false }));

export function startSyncScheduler(): void {
  if (schedulerState.started) return;
  schedulerState.started = true;

  const run = async () => {
    try {
      const results = await syncAllItems('scheduled');
      const failures = results.filter((result) => isSyncFailure(result)).length;
      logInfo(
        `scheduled sync: ${results.length} item(s)${failures > 0 ? `, ${failures} failed` : ''}`,
      );
    } catch (err) {
      logError('scheduled sync failed:', err);
    }
  };

  setTimeout(() => void run(), STARTUP_DELAY_MS).unref();
  setInterval(() => void run(), INTERVAL_MS).unref();
}
