export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  // Next does not treat a rejected register() as fatal (Verified-on:
  // next@16.3.4), so broken config exits explicitly. All imports stay dynamic
  // behind the runtime guard so the Edge bundle never pulls in Node-only APIs.
  try {
    const { installProcessBackstop } = await import('@/lib/process-backstop');
    installProcessBackstop();
    const { assertSupportedNode } = await import('@/lib/env');
    assertSupportedNode();
    const { assertAxiosErrorRedaction } = await import('@/lib/redaction-check');
    assertAxiosErrorRedaction();
    const { assertPlaidErrorExtraction, assertPlaidRetryShape } =
      await import('@/lib/plaid-error-check');
    assertPlaidErrorExtraction();
    assertPlaidRetryShape();
    const { assertPgErrorExtraction } = await import('@/lib/pg-error-check');
    assertPgErrorExtraction();
    const { assertDateParserPassthrough } = await import('@/lib/pool-config');
    assertDateParserPassthrough();
    const { waitForPostgres, assertSupportedPostgres, assertSessionModeConnection, pool } =
      await import('@/lib/db');
    await waitForPostgres();
    await assertSupportedPostgres();
    await assertSessionModeConnection();
    const { assertMigrationsApplied } = await import('@/lib/migrations-check');
    await assertMigrationsApplied(pool);
    const { startSyncScheduler } = await import('@/lib/sync-scheduler');
    startSyncScheduler();
  } catch (err) {
    const { logFatalAndExit } = await import('@/lib/log');
    logFatalAndExit('FATAL: startup config is broken —', err);
  }
}
