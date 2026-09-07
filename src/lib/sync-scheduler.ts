import { globalSingleton } from '@/lib/global-singleton';
import { logError, logInfo } from '@/lib/log';
import { syncAllItems } from '@/lib/sync-all';
import { isSyncFailure } from '@/lib/sync-failure';

// In-process sync timer, started once per server from src/instrumentation.ts;
// no webhook — the app has no internet-reachable origin. Runs shortly after
// startup and then hourly. Design: scheduled-sync, automatic-sync.

const STARTUP_DELAY_MS = 10 * 1000;
const INTERVAL_MS = 60 * 60 * 1000;

// Process-wide, not module-scope: each bundled module graph evaluates its
// own copy (see src/lib/global-singleton.ts).
const schedulerState = globalSingleton('syncScheduler', () => ({ started: false }));

export function startSyncScheduler(): void {
  if (schedulerState.started) return;
  schedulerState.started = true;

  const run = async () => {
    try {
      // Per-item failures are recorded inside the runner; this summary line
      // is the scheduler's heartbeat.
      const results = await syncAllItems();
      const failures = results.filter((result) => isSyncFailure(result)).length;
      logInfo(
        `scheduled sync: ${results.length} item(s)${failures > 0 ? `, ${failures} failed` : ''}`,
      );
    } catch (err) {
      // Reachable only if the item list itself could not be read.
      logError('scheduled sync failed:', err);
    }
  };

  // unref() so the timers never hold the process open on shutdown.
  setTimeout(() => void run(), STARTUP_DELAY_MS).unref();
  setInterval(() => void run(), INTERVAL_MS).unref();
}
