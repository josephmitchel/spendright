---
characteristic: "reliability"
---
# Summary

Four auditors reviewed the codebase against ISO/IEC 25010:2023 §3.5 (faultlessness, availability, fault tolerance, recoverability). None found a Major concern, and all four verified the prior round's fixes in code: the process crash backstop (`src/lib/process-backstop.ts` + `scripts/start.mjs` supervised respawn with a crash-loop guard), link-flow enrichment failures now recorded on the item instead of leaving an unlabeled orphan (`src/lib/link.ts:149-181`), `getItem` wrapped in `retryOnce`, and the corrected pool arithmetic. The sync/lock/timeout/retry machinery is consistently bounded and matches its design records; already-accepted trade-offs (no mid-drain checkpointing per `bounded-cursor-hold.md`, the PgBouncer session-mode constraint) were respected.

Three distinct Moderate concerns were found, each by a different auditor — notably one verified defect in the `pg` driver's interaction with the sync lock.

# Major Concerns

None.

# Moderate Concerns

- **`pg`'s client-side `query_timeout` silently defeats the sync lock's intended 60s graceful wait** (1/4, verified against the `pg` driver source) — `withItemSyncLock` (`src/lib/sync-lock.ts:12-42`) raises the session's `lock_timeout`/`statement_timeout` to 60s/70s via `SET` so a caller can wait for the per-item advisory lock and get a clean 503 `SYNC_LOCKED` on timeout (mapped from PG error `55P03`). But every pooled client inherits `POOL_CONFIG.query_timeout = 35_000` at construction (`src/lib/pool-config.ts:12-17`), and `node_modules/pg/lib/client.js` starts a client-side JS timer that runtime `SET` statements cannot affect. A lock wait exceeding ~35s — plausible under `SYNC_CONCURRENCY = 3` overlapping a user-triggered sync — throws a plain `Error('Query read timeout')` with no `.code`, so `pgErrorCode()` can't classify it and the user gets a generic 500 instead of the designed "try again in a moment" 503. Fix direction: pass `query_timeout: 0` (or ≥ `LOCK_TIMEOUT_MS` plus margin) for lock-holding clients.

- **Plaid HTTP 429 is not retried or backed off** (1/4 as Moderate here; also raised by the compatibility audit) — `isTransientPlaidFailure` (`src/lib/plaid.ts:120-124`) classifies 429 as a hard 4xx, so a rate-limited sync fails the whole item immediately and only recovers at the next hourly tick. With up to 200 pages per item and 3 items syncing concurrently, this is a real if currently unexercised path. Known and deferred (`transient-plaid-retry.md`); re-surfaced because each failed run presents the user a hard failure rather than a quiet retry.

- **Sync connection-pool headroom is tighter than the code comments claim** (1/4) — each in-flight sync item holds *two* connections (the lock session from `withItemSyncLock` plus `runSyncItem`'s `db.transaction` at `src/lib/sync.ts:75`), so `SYNC_CONCURRENCY = 3` can consume 6 of the pool's 10 connections, leaving 4 for UI requests (some of which take row locks). `pool-config.ts`'s comment gets this right, but `sync-all.ts`'s comment counts one connection per item — a 2x understatement. Pool exhaustion would surface only as opaque 10s `connectionTimeoutMillis` failures on ordinary page loads. Worth reconciling the comments and gut-checking the 4-connection headroom.

# Minor Concerns

- **`items.error` collapses two independent failure signals into one field** (3/4) — `recordSyncOutcome` (`src/lib/sync-outcome.ts:52-65`) writes either the skipped-rows message or `ACCOUNT_REFRESH_FAILED_MESSAGE`, never both; when a single sync both skips rows and fails its balance refresh, one fault is silently dropped from user-visible state. (The safety audit flags the same collision as a hazard-warning gap.)

- **`listTransactions` reads its page and total count non-atomically** (2/4) — `src/lib/transactions.ts:19-44` issues two `SELECT`s with no shared snapshot; a sync committing between them can make `total` inconsistent with the page, confusing the last-page clamp in `useTransactionPage.ts:40-41`. Cheap fix: one transaction, or `count(*) over()` in the single query.

- **Item deletion is not atomic across Plaid and the local DB** (2/4) — `removeItemCompletely` (`src/lib/items.ts:31-55`): if Plaid's `itemRemove` succeeds and the local delete then fails, the row survives pointing at an invalidated token. Self-healing on manual retry (`ITEM_NOT_FOUND` treated as success), but there's no automatic retry and no distinct half-done message.

- **`removeItem` and `getInstitutionById` lack the transient-retry wrapper applied everywhere else** (1/4) — `src/lib/plaid.ts:231-234` and `210-224`; a transient blip aborts deletion (manual retry only) or drops institution metadata (cosmetic, caller degrades gracefully). An inconsistency with the `transient-plaid-retry` policy rather than a defect.

- **No retry/backoff for a transiently unavailable database at startup** (1/4) — `src/instrumentation.ts` → `assertSupportedPostgres()` → `logFatalAndExit` treats "Postgres isn't accepting connections yet" like a config fault; the supervisor gives up after 3 exits in 60s, which three 10s connection timeouts can plausibly exhaust before a co-started Postgres is ready, leaving the app down until manual restart. Low severity under the operator-is-developer model; not covered by any design record.

- **Key-rotation script doesn't distinguish "fully rotated" from "some rows still on the old key"** (1/4) — `scripts/rotate-encryption-key.ts:23-49` is safely interruptible and rerunnable (fallback decrypt via `ENCRYPTION_KEY_PREVIOUS`), but exits with no summary or exit code reflecting partial completion.
