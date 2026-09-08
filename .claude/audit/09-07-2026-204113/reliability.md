---
characteristic: "reliability"
---
# Summary

Four auditors re-verified the prior audit's findings against an unchanged source tree. No Major concerns. The three prior Moderate concerns remain open (one auditor considered the pool-headroom comment fixed, but three confirmed `sync-all.ts`'s comment still understates per-item connection usage, so it stays open). Five prior Minor concerns remain open; the key-rotation-script visibility gap is resolved (the script now logs "Re-encrypted X of Y" with rerun-safety guidance — three of four auditors mark it resolved). One new Minor concern surfaced: the crash-loop guard's rolling window can be defeated by a slow, persistent crash cadence. The deadline/retry/lock discipline (`requests-have-deadlines.md`, `bounded-cursor-hold.md`, `transient-plaid-retry.md`) otherwise matches the code faithfully.

# Major Concerns

None.

# Moderate Concerns

- `[prior]` **`pg`'s client-side `query_timeout` defeats the sync lock's 60s graceful-wait design.** Every pooled client is constructed with `query_timeout = 35_000` (`src/lib/pool-config.ts:16`), enforced by a client-side JS timer that a runtime `SET` cannot affect (verified in `node_modules/pg/lib/client.js`). `withItemSyncLock` (`src/lib/sync-lock.ts:19-20`) raises `lock_timeout`/`statement_timeout` to 60s/70s expecting a clean 503 `SYNC_LOCKED` on `55P03`, but a lock wait past ~35s throws a plain `Error('Query read timeout')` with no `.code`, so `errorResponse()` falls through to a generic 500. `requests-have-deadlines.md` asserts "the server-side cancel wins" for this case — it doesn't. Fix: per-query `query_timeout` override on the lock-acquisition query. (Flagged by all 4 auditors.)
- `[prior]` **Plaid HTTP 429 is not retried or backed off.** `isTransientPlaidFailure` (`src/lib/plaid.ts:120-124`) treats 429 as a hard failure that aborts the whole item's sync, recovering only at the next hourly tick. Deliberately deferred by `transient-plaid-retry.md`, but that deferral doesn't account for rate-limit responses specifically. (Flagged by all 4 auditors; also raised under compatibility.)
- `[prior]` **`sync-all.ts`'s pool-usage comment undercounts connections.** `src/lib/sync-all.ts:28-29` says "each in-flight item holds a dedicated lock client," omitting the second connection `runSyncItem`'s `db.transaction` (`src/lib/sync.ts:75`) checks out from the same pool — `SYNC_CONCURRENCY = 3` can hold 6 of 10 connections. `pool-config.ts`'s own comment is accurate; the understatement persists at the file where a reader would reason about concurrency safety. (3 of 4 auditors confirm still present.)

# Minor Concerns

- `[prior]` **`items.error` collapses two independent failure signals.** `recordSyncOutcome` (`src/lib/sync-outcome.ts:57-62`) writes the skipped-rows message or `ACCOUNT_REFRESH_FAILED_MESSAGE`, never both.
- `[prior]` **`listTransactions` reads page and total count non-atomically.** `src/lib/transactions.ts:19-44` — two `SELECT`s with no shared snapshot; a concurrent sync commit can desync `total` from the page.
- `[prior]` **Item deletion is not atomic across Plaid and the local DB.** `removeItemCompletely` (`src/lib/items.ts:31-55`) — if `itemRemove` succeeds but `db.delete` fails, the row survives pointing at an invalidated token (self-heals only via manual retry through `ITEM_NOT_FOUND`).
- `[prior]` **`removeItem` and `getInstitutionById` lack the `retryOnce` wrapper** applied to every other Plaid call (`src/lib/plaid.ts:210-224, 231-234`), inconsistent with the `transient-plaid-retry` policy.
- `[prior]` **No retry/backoff for a transiently unavailable Postgres at startup.** `instrumentation.ts` → `assertSupportedPostgres()` treats any failure as fatal; `scripts/start.mjs`'s 3-restarts-in-60s guard can be exhausted before a co-started Postgres is ready.
- `[new]` **The crash-loop guard can be defeated by a slow, persistent crash cycle.** `scripts/start.mjs:61-70` counts only restarts within a rolling 60s window; a fault crashing the server every ~60-70s never accumulates 3 starts in-window, so the supervisor restarts forever instead of surfacing the designed hard stop. (Flagged by 1 of 4 auditors.)

## Resolved since prior audit

- **Key-rotation script partial-completion visibility** — `scripts/rotate-encryption-key.ts:45-49` now logs "Re-encrypted X of Y access token(s)… rerunning is safe," addressing the original gap (3 of 4 auditors mark resolved; one notes a residual nicety of a distinct exit code for partial runs, judged not worth tracking).
