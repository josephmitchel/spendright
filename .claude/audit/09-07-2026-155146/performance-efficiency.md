---
characteristic: "performance efficiency"
---
# Summary

All five auditors independently reached the same conclusion: no active performance problems exist at the current single-user, single-card, single-institution scale, and the codebase shows deliberate, documented performance-conscious engineering throughout — bounded retry/page budgets, chunked upserts sized under Postgres's 65,535 bind-parameter cap, clamped pagination, covering indexes on the hot transaction-list path, single-flight/serialize-by-key sync coordination, and process-wide singletons for the DB pool and Plaid client. Every finding below is a forward-looking scaling concern to revisit deliberately before adding multi-institution or multi-user usage, not something requiring immediate action.

The one finding raised by all five auditors: the fully sequential per-item sync loop, which makes sync wall-clock time scale linearly with the number of linked institutions.

# Major Concerns

None found by any of the five auditors.

# Moderate Concerns

- **Sequential sync across items** (flagged by 5 of 5 auditors) — `src/lib/sync-all.ts:25-37` awaits `syncItem(item)` in a plain `for` loop. Each item involves multiple Plaid round trips plus up to ~20s of `NOT_READY` backoff (`src/lib/plaid.ts:210-211`), so wall-clock time for the hourly scheduled sync (`src/lib/sync-scheduler.ts`), manual "Sync all" (`POST /api/sync`, which awaits the whole loop before responding), and the 120s client fetch deadline all scale linearly with linked institutions. Items are independent (only per-item cursor serialization is required), so a bounded `Promise.allSettled` is a straightforward win once more than one institution is linked. Sequential ordering is not documented as deliberate in the design record.

- **Effectively unbounded `offset` pagination** (flagged by 3 of 5) — `src/app/api/transactions/route.ts:8-21` clamps `limit` to 1000 but `offset` only to `Number.MAX_SAFE_INTEGER`; `LIMIT/OFFSET` paging (`src/lib/transactions.ts:34-36`) forces Postgres to walk and discard rows proportional to offset depth, even with the covering index (`transactions_account_date_idx`, `src/db/schema.ts:130`). Applies to steady-state accumulated history (separate from the small-first-sync decision). A keyset/cursor scheme avoids the cost scaling with page depth.

- **Unconditional 60s polling with no change detection** (flagged by 3 of 5) — `src/hooks/useVisiblePoll.ts:6-22` re-fetches accounts, items, and the current transaction page every 60s per visible tab with no ETag/304 short-circuit in the API routes. Correctly pauses on hidden tabs and is a documented trade-off (`home-reflects-background-sync`), but DB load grows linearly with concurrently open tabs/users.

- **O(n²) array growth in Plaid pagination** (flagged by 2 of 5) — `src/lib/plaid.ts:267-269` builds `added`/`modified`/`removed` via `.concat(...)` inside the `while (hasMore)` loop (up to 200 pages × 500 rows); each iteration copies the whole accumulated array. `push(...spread)` or a single flatten makes it O(n). The full batch is also held in memory before persisting — a latent ceiling if the small-initial-sync assumption ever changes.

# Minor Concerns

- **Two DB round trips per transaction-page fetch** (flagged by 5 of 5) — `src/lib/transactions.ts:24-43` runs the paged `select` plus a separate `count(*)` on every call (hit on every navigation and 60s poll); a `count(*) OVER()` window column would cut it to one.
- **Per-account sequential DB transactions in `storeAccounts`** (flagged by 4 of 5) — `src/lib/accounts.ts:77-97` opens one `db.transaction` per account in a `for` loop; fault isolation is the documented rationale but could be kept with batched individual `ON CONFLICT` statements.
- **No pool tuning or statement timeout** — `src/lib/db.ts:22-26` uses `pg` defaults (max 10, no idle/connection/statement timeout); an accidental expensive query has no server-side cutoff and holds a pool connection indefinitely (also raised under Reliability).
- **No caching of rarely-changing reference data** — the card catalog is re-queried on every account refresh (`src/lib/card-catalog.ts:15-17` from `src/lib/accounts.ts:103`) and `/api/cards` is polled every 60s though it only changes via the manual seed script; the existing `globalSingleton` pattern would cover it.
- **Independent reads run sequentially inside the persistence transaction** — `src/lib/sync.ts:69-91`: `knownAccountIdsFor` and `resolveCarriedSelections` are independent but run serially under the held transaction.
- **Raw Plaid payload stored per transaction indefinitely** — `src/db/schema.ts:125`; documented design choice; storage-growth watch item only.
- **No standalone index on `transactions.date`** — only the composite `(account_id, date desc)` exists; becomes relevant only if cross-account date-range features are added.
- **Key re-derivation on every encrypt/decrypt call** — `src/lib/crypto.ts:10-20`; negligible cost, noted for consistency with the singleton pattern.
