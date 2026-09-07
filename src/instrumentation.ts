// Design: scheduled-sync.
import { logFatalAndExit } from '@/lib/log';

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  // Next does not treat a rejected register() as fatal (Verified-on:
  // next@16.3.4), so broken config exits explicitly.
  try {
    const { startSyncScheduler } = await import('@/lib/sync-scheduler');
    startSyncScheduler();
  } catch (err) {
    logFatalAndExit('FATAL: startup config is broken —', err);
  }
}
