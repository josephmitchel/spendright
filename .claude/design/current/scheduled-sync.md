---
name: scheduled-sync
description: Automatic sync is an in-process timer started once per server from src/instrumentation.ts — one run shortly after startup, then hourly; the scheduler and POST /api/sync share a single-flight sync-all runner whose guard lives on globalThis because the bundler duplicates the module across chunks
tags:
  [
    startSyncScheduler,
    src/lib/sync-scheduler.ts,
    syncAllItems,
    src/lib/sync-all.ts,
    POST /api/sync,
    register,
    src/instrumentation.ts,
    scripts/start.mjs,
    globalThis,
    globalSingleton,
    src/lib/global-singleton.ts,
    serializeByKey,
    singleFlight,
    src/lib/async-coordination.ts,
    SYNC_CONCURRENCY,
    recordLastSync,
    lastSyncStatus,
    src/lib/sync-status.ts,
  ]
date: 2026-09-05
---

Confirmed 2026-09-05, replacing the webhook path (retired [[webhook-triggered-sync]]): the 2026-09-05 audit found the tunnel exposed `next dev`'s `/__nextjs_*` endpoints past every guard, and retiring the tunnel removes the app's internet-reachable origin entirely. The in-process timer was chosen over an OS scheduler (syncs fail silently whenever the server is down, and it is machine-level config outside the repo) and over node-cron (a dependency for flexibility a fixed interval doesn't need). One run ~10s after startup — data is fresh when the app is opened — then hourly, comfortably ahead of Plaid's few-times-a-day refresh; both timers unref'd so they never hold the process open.

`syncAllItems` (src/lib/sync-all.ts) is single-flight: a manual Sync all during a scheduled run joins the run in flight rather than starting a duplicate pass. The cursor-write invariant itself — no two concurrent `syncItem` calls on one item — is enforced inside `syncItem` (src/lib/sync.ts) by a per-item promise chain, confirmed 2026-09-06: the 2026-09-06 design audit found the exchange route's inline initial sync ([[inline-initial-sync]]) is a second `syncItem` entry point outside the sync-all guard, so a re-link while the hourly run was in flight could race the cursor write. With the lock in `syncItem`, every caller present and future is serialized per item by construction — within one process; cross-process serialization comes from a Postgres advisory lock since 2026-09-07 ([[cross-process-sync-lock]]), and the globalThis machinery here is retained for in-process queueing and join semantics, not as the sole correctness guarantee. The single-flight sync-all guard remains for its join semantics. **The in-flight guard must live on `globalThis`, not module scope** (2026-09-05 design audit): the bundler emits separate copies of the module for the route's static import and the scheduler's dynamic import — verified in the compiled chunks — so a module-scope variable is one guard per copy, not one per process, and the race the design forbids comes back silently. The same rule holds for the scheduler's started flag (src/lib/sync-scheduler.ts) and the db pool cache (src/lib/db.ts, now unconditional rather than dev-only). Any future once-per-process state must go on `globalThis` — since 2026-09-06 through `globalSingleton` (src/lib/global-singleton.ts), the one place holding the cast and this rationale; the per-item chain and the single-flight join are likewise expressed once, as `serializeByKey`/`singleFlight` in src/lib/async-coordination.ts (named serialize.ts until 2026-09-07 — [[modules-named-for-contents]]), rather than re-implemented per site.

Since 2026-09-07 `runSyncAll` syncs items with bounded concurrency (`SYNC_CONCURRENCY` = 3) rather than strictly sequentially — the 2026-09-07 performance audit noted wall-clock time scaled linearly with linked institutions for no correctness reason, since per-item ordering comes from `serializeByKey` plus the item lock, not the loop. The bound is sized against the pool max of 10 ([[shared-pool-config]]), and the honest arithmetic (corrected 2026-09-07 by the reliability audit) is two connections per in-flight item — the dedicated lock client held for the whole critical section ([[cross-process-sync-lock]]) plus the persistence transaction's connection — so three concurrent items can occupy up to 6 of 10, leaving 4 for concurrent UI requests. Accepted at single-user scale; raising `SYNC_CONCURRENCY` or shrinking the pool must revisit both together. Failure entries carry `institutionName` so the sync status line names the institution, not an opaque item id.

Also since 2026-09-07, the run's own outcome is recorded in-memory (`recordLastSync`/`lastSyncStatus`, src/lib/sync-status.ts — in-process is correct because the scheduler is) and served on `GET /api/items` as `lastSync`: the 2026-09-07 safety audit found a whole-run failure (the initial items select throwing — DB down, pool exhausted) had no item row to carry it, so the scheduled path could fail silently every hour while the manual path surfaced the identical error. The home page now shows when the last run finished and, when the run itself failed, that error.

Per-item failures are recorded on `items.error` through the allow-list exactly as the manual path always did ([[error-message-allow-list]]). The scheduler starts from `register()` via dynamic import (the runtime bind assertion that used to be scheduled ahead of it is retired — [[runtime-bind-assertion]]), and a broken config (unset DATABASE_URL, say) stops the server with the error named via an explicit catch — Next itself does not treat a rejected `register()` as fatal (verified 2026-09-05), so the exit cannot be left implicit ([[config-validated-not-assumed]]). Under `next start`, instrumentation only runs on the first request, so `npm run start` goes through `scripts/start.mjs`, which sends a loopback warm-up request at startup — the scheduler starts when the server does, not when traffic first arrives. Fulfils [[automatic-sync]]; [[non-local-request-guard]] no longer carries any exemption. The home page reflects these background runs via [[home-reflects-background-sync]].
