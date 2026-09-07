---
name: db-pool-errors-logged
description: Both pg Pools carry an error listener that logs idle-client faults via logError and continues — without one, node-postgres re-emits an idle connection's failure as an unlistened 'error' event, an uncaught exception that kills the server and its hourly sync scheduler until manually restarted
tags:
  [
    Pool,
    error listener,
    logError,
    src/lib/db.ts,
    scripts/seed-cards.ts,
    globalSingleton,
    idle client,
  ]
date: 2026-09-07
---

Confirmed 2026-09-07 after all three reliability auditors flagged the same gap: node-postgres keeps idle clients between queries, and when an idle client's backend connection fails (Postgres restart, dropped TCP flow, laptop suspend) there is no in-flight query promise to reject, so pg emits `'error'` on the Pool itself. With no listener, EventEmitter semantics turn that into an uncaught exception that kills the process — including the in-process hourly scheduler ([[scheduled-sync]]) — so syncs stop silently until a manual restart. That is the "transient fault becomes a permanent, invisible outage" class [[requests-have-deadlines]] closed for Plaid/fetch waits, missed on the DB side.

The fix is log-and-continue, not crash/reconnect logic: the pool self-heals by discarding the broken client and dialing fresh connections on the next query, and queries in flight still reject to their callers, so the `'error'` event is purely informational. Both pool sites (`src/lib/db.ts`, `scripts/seed-cards.ts`) attach one listener that logs through `logError` — the existing chokepoint that also handles axios redaction ([[plaid-error-log-redaction]]).

In `src/lib/db.ts` the listener attaches **inside** the `globalSingleton` factory, not at module scope after the singleton call: the bundler emits a copy of the module per import graph ([[scheduled-sync]]), so module-scope attachment would run once per copy and stack duplicate listeners on the one shared pool. In the seed script it also keeps an idle-client fault from bypassing the `finally { pool.end() }` and the script's fatal handler.
