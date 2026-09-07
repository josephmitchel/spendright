---
name: process-crash-backstop
description: unhandledRejection/uncaughtException exit loudly via logFatalAndExit, and scripts/start.mjs restarts the crashed server (with a crash-loop guard) so automatic syncing self-heals
tags: [installProcessBackstop, src/lib/process-backstop.ts, unhandledRejection, uncaughtException, spawnServer, scripts/start.mjs, logFatalAndExit]
date: 2026-09-07
---

Confirmed 2026-09-07: the 2026-09-07 reliability audit (3 of 4 auditors) found no process-level backstop anywhere — an unhandled rejection escaping a dependency's internals would crash Node with its default behavior and silently end the in-process hourly scheduler ([[scheduled-sync]]) until a human noticed, the same "transient fault becomes a permanent invisible outage" class already closed for the Plaid client, fetch layer, and DB pool ([[db-pool-errors-logged]]). The user chose log-and-exit paired with supervised restart over log-and-continue (which risks running in an unknown state). `installProcessBackstop` (src/lib/process-backstop.ts, installed from instrumentation's `register` behind a `globalSingleton` guard) routes both `unhandledRejection` and `uncaughtException` through the existing `logFatalAndExit`. `scripts/start.mjs` now respawns the server after an unexpected exit (1s delay, warm-up re-run so the scheduler restarts too) and gives up after 3 exits within 60 seconds so a persistent fault surfaces as a hard stop instead of a crash loop. `npm run dev` has no supervisor — dev sessions are attended by definition.
