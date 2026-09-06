// Two once-per-server jobs: the loopback bind assertion (the enforcement
// layer of non-local-request-guard, implemented in src/lib/bind-assertion.ts)
// and the sync scheduler (design: scheduled-sync). Both modules import node
// builtins or the server-only graph, so each is dynamically imported after
// the runtime check.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  // The assertion is scheduled before the scheduler's fallible import, so no
  // failure in the sync module graph can disable it — and a failure loading
  // the assertion itself stops the server rather than serving unasserted.
  // Design: non-local-request-guard.
  try {
    const { scheduleBindAssertion } = await import('@/lib/bind-assertion');
    scheduleBindAssertion();
  } catch (err) {
    console.error('FATAL: could not start the bind assertion —', err);
    process.exit(1);
  }

  // Dynamically imported so the module graph (db, Plaid SDK) loads only in
  // the nodejs runtime. A broken config (say, an unset DATABASE_URL) throws
  // here, and Next does not treat a rejected register() as fatal (verified
  // on Next 16.3.4: it logs and keeps serving), so the exit is explicit — better
  // than a live server whose every sync would fail.
  // Design: config-validated-not-assumed.
  try {
    const { startSyncScheduler } = await import('@/lib/sync-scheduler');
    startSyncScheduler();
  } catch (err) {
    console.error('FATAL: startup config is broken —', err);
    process.exit(1);
  }
}
