---
characteristic: "performance efficiency"
---
# Summary

All three auditors found no major performance defects and independently described the codebase as unusually performance-conscious for its stage: bounded Plaid retry/page budgets (`MAX_SYNC_PAGES`, `NOT_READY_DELAY_MS` in `src/lib/plaid.ts`), chunked upserts under Postgres's bind-parameter cap (`UPSERT_CHUNK_SIZE` in `src/lib/sync-persist.ts`), single-flight/serialize-by-key coordination (`src/lib/async-coordination.ts`), clamped pagination, useful covering indexes (`transactions_account_date_idx`), and appropriately sized client polling. All findings are forward-looking scaling concerns rather than active problems at the current single-card, single-item scale.

# Major Concerns

None found by any auditor.

# Moderate Concerns

- **Sequential (non-concurrent) sync across items** (flagged by all 3 auditors) — `src/lib/sync-all.ts` (`runSyncAll`, ~lines 21–40) awaits `syncItem` per item in a plain `for` loop. Each item's sync involves multiple sequential Plaid round trips and up to 20s of `NOT_READY` backoff, so wall-clock time for the hourly scheduled sync and the manual "Sync all" grows linearly with the number of linked institutions instead of being bounded by the slowest one. The existing `serializeByKey` guard is per-item, so parallelizing across items (e.g. bounded `Promise.allSettled`) would be straightforward. Non-issue today (one item), but worth deciding intentionally before multi-institution support.
- **Quadratic array growth in Plaid sync pagination** (1 auditor) — `src/lib/plaid.ts` `syncTransactions` (~lines 184–235) accumulates `added`/`modified`/`removed` via `concat` inside the `while (hasMore)` loop (worst case ~100k rows across 200 pages), giving O(n²) copy churn versus `push(...)` or flatten-once.
- **Unconditional 60s polling with no change detection** (1 auditor) — `src/hooks/useVisiblePoll.ts` re-fetches accounts, cards, and the current transaction page every 60 seconds per visible tab with no ETag/Cache-Control/"nothing changed" short-circuit in the API routes. Intentional per the `home-reflects-background-sync` design and fine for one user; DB load grows linearly with open tabs/users.
- **Inline, synchronous initial sync on the exchange request** (1 auditor) — `src/lib/link.ts` `linkItem` (~lines 132–154) performs token exchange, account fetch, and a full initial transaction sync (including possible `NOT_READY` waits) within one HTTP request before the client sees a response. Deliberate (`Design: inline-initial-sync`); flagged purely as a time-behavior watch item.

# Minor Concerns

- **Two DB round trips per transaction page** (2 auditors) — `src/lib/transactions.ts` `listTransactions` (~lines 19–44) runs a paged select plus a separate `count(*)` on every call; a `count(*) OVER()` window column would halve round trips on a path hit by every navigation and every poll.
- **Effectively unbounded `offset` pagination** (3 auditors, ranked minor-to-moderate) — `src/app/api/transactions/route.ts` clamps `limit` to 1000 but `offset` only to `Number.MAX_SAFE_INTEGER`; deep offsets force Postgres to scan and discard rows. Keyset/cursor pagination avoids the cost scaling with depth.
- **Per-account sequential DB transactions in `storeAccounts`** (2 auditors) — `src/lib/accounts.ts` (~lines 77–97) opens one transaction per account; a documented fault-isolation trade-off, flagged only as proportional overhead if accounts-per-item grows.
- **No caching of rarely-changing reference data** (1 auditor) — the card catalog is re-queried on every account refresh (`src/lib/card-catalog.ts`) and `/api/cards` is polled every 60s despite changing only via the manual seed script; an in-memory cache would cut redundant DB load.
- **Raw Plaid payload stored per transaction indefinitely** (1 auditor) — `src/db/schema.ts` line 125 keeps the full `jsonb` payload per row (documented design choice `raw-plaid-payload-stored-not-served`); noted only as a storage-capacity item with no retention policy.
- **Key re-derivation on every encrypt/decrypt** (1 auditor) — `src/lib/crypto.ts` `getKey()` re-validates and re-allocates the key buffer per call rather than caching via the `globalSingleton` pattern used elsewhere; negligible cost, consistency note only.
