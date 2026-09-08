// Design: scheduled-sync, process-crash-backstop, runtime-version-floors.

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  // Next does not treat a rejected register() as fatal (Verified-on:
  // next@16.3.4), so broken config exits explicitly. All imports stay dynamic
  // behind the runtime guard so the Edge bundle never pulls in Node-only APIs.
  try {
    const { installProcessBackstop } = await import('@/lib/process-backstop');
    installProcessBackstop();
    const { assertSupportedPostgres } = await import('@/lib/db');
    await assertSupportedPostgres();
    const { startSyncScheduler } = await import('@/lib/sync-scheduler');
    startSyncScheduler();
  } catch (err) {
    const { logFatalAndExit } = await import('@/lib/log');
    logFatalAndExit('FATAL: startup config is broken —', err);
  }
}
