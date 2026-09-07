// Once-per-server startup: the sync scheduler (design: scheduled-sync).
import { logFatalAndExit } from '@/lib/log';

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  // Dynamically imported so the module graph (db, Plaid SDK) loads only in
  // the nodejs runtime. Next does not treat a rejected register() as fatal
  // (it logs and keeps serving), so a broken config (say, an unset
  // DATABASE_URL) exits explicitly instead of leaving a live server whose
  // every sync would fail. Verified-on: next@16.3.4
  // Design: config-validated-not-assumed.
  try {
    const { startSyncScheduler } = await import('@/lib/sync-scheduler');
    startSyncScheduler();
  } catch (err) {
    logFatalAndExit('FATAL: startup config is broken —', err);
  }
}
