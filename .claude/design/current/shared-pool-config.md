---
name: shared-pool-config
description: One pool definition — POOL_CONFIG/createBoundedPool in src/lib/pool-config.ts, explicit max of 10 — shared by the server and both standalone scripts, and every pool carries the idle-client error listener that logs via logError and continues (an unlistened pool 'error' event is an uncaught exception that kills the server and its scheduler)
tags:
  [
    POOL_CONFIG,
    createBoundedPool,
    src/lib/pool-config.ts,
    src/lib/db.ts,
    scripts/seed-cards.ts,
    scripts/rotate-encryption-key.ts,
    Pool,
    error listener,
    logError,
    globalSingleton,
    idle client,
  ]
date: 2026-09-07
---

Confirmed 2026-09-07: the 2026-09-07 maintainability audit found the pool timeouts and idle-error handler hand-copied across `src/lib/db.ts`, `scripts/seed-cards.ts`, and `scripts/rotate-encryption-key.ts`, synced only by a comment — no tooling would catch drift in values [[requests-have-deadlines]] treats as a deliberate invariant. The fix follows the repo's own precedent (pg-errors/plaid-errors pulled out of server-only modules): `src/lib/pool-config.ts` is importable by both the server-only `db.ts` and the scripts, and `createBoundedPool` attaches the idle-error listener (below) in the same breath. `max: 10` is now explicit rather than `pg`'s silent default, because the sync design's capacity arithmetic is sized against that exact number — and the reliability audit corrected that arithmetic: each in-flight sync item holds **two** connections during persistence (the [[cross-process-sync-lock]] session for the whole critical section, plus the `db.transaction` connection), so `SYNC_CONCURRENCY = 3` can occupy up to 6 of the 10, leaving 4 for concurrent UI requests. That margin is accepted at single-user scale; raising `SYNC_CONCURRENCY` or shrinking the pool must revisit it together.

## Pool errors logged (confirmed 2026-09-07)

Confirmed 2026-09-07 after all three reliability auditors flagged the same gap: node-postgres keeps idle clients between queries, and when an idle client's backend connection fails (Postgres restart, dropped TCP flow, laptop suspend) there is no in-flight query promise to reject, so pg emits `'error'` on the Pool itself. With no listener, EventEmitter semantics turn that into an uncaught exception that kills the process — including the in-process hourly scheduler ([[scheduled-sync]]) — so syncs stop silently until a manual restart. That is the "transient fault becomes a permanent, invisible outage" class [[requests-have-deadlines]] closed for Plaid/fetch waits, missed on the DB side.

The fix is log-and-continue, not crash/reconnect logic: the pool self-heals by discarding the broken client and dialing fresh connections on the next query, and queries in flight still reject to their callers, so the `'error'` event is purely informational. Both pool sites (`src/lib/db.ts`, `scripts/seed-cards.ts`) attach one listener that logs through `logError` — the existing chokepoint that also handles axios redaction ([[plaid-error-log-redaction]]).

In `src/lib/db.ts` the listener attaches **inside** the `globalSingleton` factory, not at module scope after the singleton call: the bundler emits a copy of the module per import graph ([[scheduled-sync]]), so module-scope attachment would run once per copy and stack duplicate listeners on the one shared pool. In the seed script it also keeps an idle-client fault from bypassing the `finally { pool.end() }` and the script's fatal handler.
