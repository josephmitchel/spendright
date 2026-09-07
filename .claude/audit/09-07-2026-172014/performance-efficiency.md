---
characteristic: 'performance efficiency'
---

# Summary

Four independent auditors reviewed the codebase against ISO/IEC 25010:2023 §3.2 (time behaviour, resource utilization, capacity). All four reached the same overall verdict: the codebase shows deliberate, well-executed performance engineering for its current single-user/single-card/single-institution scale — bounded Plaid retry/page budgets, chunked upserts sized under Postgres's bind-parameter cap, clamped pagination limits, a covering index on the hot transaction-list path (`transactions_account_date_idx`), single-flight/serialize-by-key sync coordination, and process-wide singletons for the DB pool and Plaid client. **No auditor found a major issue.** Every finding below is a forward-looking scaling risk rather than an active problem, and several were independently confirmed by all four auditors. All findings from the prior audit pass (`09-07-2026-155146`) were re-verified as still present.

# Major Concerns

None.

# Moderate Concerns

- **Sequential sync across items** (`src/lib/sync-all.ts:25-37`) — flagged by 3 of 4 auditors. `runSyncAll` awaits `syncItem` per item in a plain `for` loop; each item costs multiple Plaid round trips plus up to ~20s of `NOT_READY` backoff (`src/lib/plaid.ts:212-213`, `258-266`). Wall-clock time for the hourly scheduled sync, manual `POST /api/sync`, and the client's 120s fetch deadline all scale linearly with the number of linked institutions. Per-item cursor serialization already exists (`withItemSyncLock`/`serializeByKey`), so a bounded `Promise.allSettled` across items would be safe. Not documented as a deliberate choice. (The fourth auditor considered this appropriate at documented single-card scale — the disagreement is about when it matters, not whether it's real.)
- **Pooled DB connection held across external Plaid I/O** (`src/lib/sync-lock.ts:13-37`) — `withItemSyncLock` checks out a `pool.connect()` client and holds it for the entire `runSyncItem`, including all Plaid network calls (up to 200 sync pages plus up to 10 × 2s `NOT_READY` sleeps). With the pool at `pg`'s default max of 10 (`src/lib/db.ts:22-26`, no explicit `max`), concurrent item syncs each pin a scarce connection for the full external-call duration and could starve ordinary request handling under real concurrency.
- **Effectively unbounded `offset` pagination** (`src/app/api/transactions/route.ts:21`, `src/lib/transactions.ts:34-36`) — flagged by all 4 auditors (two rated it minor at current scale). `limit` is clamped to `MAX_PAGE_LIMIT` but `offset` only to `Number.MAX_SAFE_INTEGER`; `LIMIT/OFFSET` forces Postgres to walk and discard rows proportional to offset depth even with the covering index. A keyset/cursor scheme (seek on `(date, id)`, which the existing index already supports) keeps cost independent of page depth as history accumulates.
- **O(n²) array growth in Plaid sync pagination** (`src/lib/plaid.ts:269-271`) — flagged by all 4 auditors (rated moderate by two, minor by two). `added`/`modified`/`removed` are rebuilt via `.concat(...)` on each of up to 200 pages (500 rows/page), copying the whole accumulated array each iteration; the entire batch is also held in memory before persisting. `push(...spread)` or a single post-loop flatten makes it linear.
- **Unconditional 60s polling with no change detection** (`src/hooks/useVisiblePoll.ts:6-22`) — flagged by 2 auditors. Accounts, items, and the current transaction page are re-fetched every 60s per visible tab with no ETag/304 or "nothing changed" short-circuit in the API routes. Hidden-tab pausing is a documented trade-off (`home-reflects-background-sync`), but DB load grows linearly with concurrently open tabs.

# Minor Concerns

- **Two DB round trips per transaction-page fetch** (`src/lib/transactions.ts:24-43`) — flagged by 3 auditors: paged `select` plus separate sequential `count(*)` on every page view and 60s poll; a `count(*) OVER()` window column (or at minimum `Promise.all`) collapses this.
- **Per-account sequential DB transactions in `storeAccounts`** (`src/lib/accounts.ts:77-97`) — one `db.transaction` per account in a `for` loop. Fault isolation is the documented rationale; batched `ON CONFLICT` with per-row error tracking could preserve it with fewer round trips.
- **No pool tuning or statement timeout** (`src/lib/db.ts:22-26`) — `pg` defaults throughout (max 10, no idle/connection/statement timeout); an expensive or hanging query has no server-side cutoff and can hold a pool connection indefinitely (overlaps with Reliability findings).
- **No caching of rarely-changing reference data** — the card catalog is re-queried on every account refresh (`src/lib/card-catalog.ts:15-17` via `src/lib/accounts.ts:103`) and `/api/cards` is polled every 60s though the catalog only changes via the manual seed script; the existing `globalSingleton` pattern covers this cheaply.
- **Independent reads run sequentially inside the held persistence transaction** (`src/lib/sync.ts:76-79`) — `knownAccountIdsFor` and `resolveCarriedSelections` are independent but run serially, extending the lock hold that category PATCHes compete for (see comment at `sync-persist.ts:118-119`).
- **No standalone index on `transactions.date`** (`src/db/schema.ts:130-133`) — only the composite `(account_id, date desc)` index exists; matters only if a cross-account date-range feature is added.
- **Key re-derivation on every encrypt/decrypt call** (`src/lib/crypto.ts:10-19`) — env read + validation + `Buffer.from` per call rather than a cached key; negligible today, noted for consistency with the singleton pattern used elsewhere.
- **Raw Plaid payload stored per transaction indefinitely** (`src/db/schema.ts:125`) — documented design choice (`raw-plaid-payload-stored-not-served`); flagged only as a storage-growth watch item.
