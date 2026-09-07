---
name: requests-have-deadlines
description: Every network wait is bounded — Plaid calls carry a 60s axios timeout, the transactions/sync drain is capped at 200 pages, client fetches abort at 120s, and Postgres waits are capped at the pool (connect 10s, statement 30s) plus a 10s row-lock cap inside the sync transaction — because a hung request otherwise latches the sync guards or wedges a page on "Loading…" forever
tags:
  [
    PLAID_TIMEOUT_MS,
    MAX_SYNC_PAGES,
    REQUEST_TIMEOUT_MS,
    POOL_TIMEOUTS,
    connectionTimeoutMillis,
    statement_timeout,
    lock_timeout,
    getClient,
    syncTransactions,
    getJson,
    sendJson,
    src/lib/plaid.ts,
    src/lib/http.ts,
    src/lib/db.ts,
    AbortSignal.timeout,
    singleFlight,
    serializeByKey,
  ]
date: 2026-09-06
---

Confirmed 2026-09-06 after a quality audit found that nothing in the app had a deadline, and that the coordination guards turn one hung wait into a permanent, invisible outage:

- **Plaid calls: 60s axios timeout** (`PLAID_TIMEOUT_MS` in the one client `Configuration`). Axios defaults to waiting forever, and a stalled connection (laptop suspend mid-sync, silently dropped NAT flow) would never settle its promise — which latches `singleFlight`'s slot and `serializeByKey`'s per-item tail permanently, disabling automatic **and** manual sync until restart with no log line and no `items.error`. That is the exact "syncs fail silently" mode [[scheduled-sync]] rejected an OS scheduler over.
- **The `has_more` drain: 200-page cap** (`MAX_SYNC_PAGES`) at an explicitly requested 500-row page size (`SYNC_PAGE_SIZE`, passed as `count` since 2026-09-06 — a quality audit found the cap's sizing argument assumed 500-row pages while the call took Plaid's 100-row default). At that size the cap is years of history, so hitting it means Plaid is re-serving a cursor without progress; the drain throws a `SYNC_PAGE_BUDGET` PublicError (502) instead of spinning the same latch forever.
- **Client fetches: 120s `AbortSignal.timeout`** (`REQUEST_TIMEOUT_MS` in `getJson`/`sendJson`, the one fetch chokepoint [[single-response-reader]]). A request that never answers would leave `useLoadProtocol` unsettled forever — "Loading…" with the Retry withheld, a failure [[partial-load-rendering]] otherwise has no path for. Sized well past the slowest legitimate route (a multi-item sync-all with not-ready polling, [[not-ready-poll-budgets]]); the abort surfaces as a normal failed read with Retry. A fetch rejection (abort or network) throws the caller's fallback message, keeping the error-string allow-list intact ([[error-message-allow-list]]).

- **Postgres: pool-level timeouts + a row-lock cap in the sync transaction** (added 2026-09-07 — the 2026-09-07 reliability audit found this record's principle was never extended to the one remaining unbounded network dependency, where a stalled backend wedged `withItemSyncLock`'s held connection and the sync guards with no log line). `POOL_TIMEOUTS` (src/lib/db.ts): `connectionTimeoutMillis` 10s, `statement_timeout` 30s, `query_timeout` 35s (the server-side cancel wins, yielding a clean pg error); the seed and rotation scripts mirror the same values on their own pools. `runSyncItem`'s transaction sets `local lock_timeout = '10s'` over its `for update` reads, matching the 3s cap the category PATCH already had — one write path no longer tolerates an unbounded lock wait the other rejects. The advisory-lock session raises its own `statement_timeout` above its 60s wait so the pool default cannot cancel it ([[cross-process-sync-lock]]).

The timeouts are last-resort guards against hangs, not SLAs; an aborted client request does not cancel the server-side sync, which finishes and records its own outcome. Transport-level Plaid blips additionally get one in-attempt retry ([[transient-plaid-retry]]).
