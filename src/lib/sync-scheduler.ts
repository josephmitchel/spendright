import { globalSingleton } from '@/lib/global-singleton';
import { logError } from '@/lib/log';
import { syncAllItems } from '@/lib/sync-all';

// The automatic sync path: an in-process timer, started once per server from
// src/instrumentation.ts. It replaced the retired Plaid webhook + tunnel
// — with no internet-reachable route, the app has no exposed
// origin at all. Runs shortly after startup (data is fresh when the app is
// opened) and then hourly, comfortably ahead of Plaid's few-times-a-day
// refresh cadence. Design: scheduled-sync, automatic-sync.

const STARTUP_DELAY_MS = 10 * 1000;
const INTERVAL_MS = 60 * 60 * 1000;

// A process-wide singleton so the guard is once per process, not once per
// module copy — a module-scope flag would let a caller through another copy
// double the timers.
const schedulerState = globalSingleton('syncScheduler', () => ({ started: false }));

export function startSyncScheduler(): void {
  // register() runs once per server instance, but guard anyway so a second
  // caller can never double the timers.
  if (schedulerState.started) return;
  schedulerState.started = true;

  const run = async () => {
    try {
      // Per-item failures are logged and recorded on items.error inside the
      // runner; this summary line is the scheduler's own heartbeat.
      const results = await syncAllItems();
      const failures = results.filter((result) => 'error' in result).length;
      console.log(
        `scheduled sync: ${results.length} item(s)${failures > 0 ? `, ${failures} failed` : ''}`,
      );
    } catch (err) {
      // Reachable only if the item list itself could not be read.
      logError('scheduled sync failed:', err);
    }
  };

  // unref() so the timers never hold the process open on shutdown.
  setTimeout(run, STARTUP_DELAY_MS).unref();
  setInterval(run, INTERVAL_MS).unref();
}
