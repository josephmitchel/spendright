---
characteristic: "reliability"
---
# Summary

Four auditors assessed reliability (ISO/IEC 25010:2023 §3.5). All four independently verified the prior round's fixes are live: Postgres pool/query timeouts with idle-error logging (`src/lib/db.ts`), bounded row locks inside the sync transaction (`src/lib/sync.ts:78`), item deletion under the per-item sync lock (`src/lib/items.ts`), one-shot transient Plaid retry (`src/lib/plaid.ts:120-134`), bounded sync-all concurrency (`SYNC_CONCURRENCY = 3`), and React error boundaries. The core sync/locking/timeout/scheduler implementation matches its design records. Remaining concerns cluster around three themes: the process itself as a single point of failure, a partial-failure gap in the link flow, and connection-pool arithmetic that the design records got slightly wrong.

# Major Concerns

None.

# Moderate Concerns

- **No process-level crash recovery for the in-process scheduler** (3/4 auditors; 1 rated moderate) — no `process.on('unhandledRejection'/'uncaughtException')` backstop exists anywhere (grep-confirmed), and no supervisor/restart policy is defined (no Dockerfile, systemd unit, or pm2 config; `scripts/start.mjs` propagates a child crash rather than restarting). Since automatic sync rides on one long-lived Node process (`scheduled-sync.md`), a single uncaught exception — including from a dependency's internals, outside any `withErrorResponse` — kills the server and silently ends hourly syncing until a human restarts it. This is the same "transient fault becomes a permanent, invisible outage" class already closed for the Plaid client, fetch layer, and DB pool (`db-pool-errors-logged.md`), but not for the process itself. A `process.on(...)` log-and-continue (or log-and-exit consistent with `logFatalAndExit` in `src/instrumentation.ts`) is the cheap fix.

- **Partial link failure leaves an unexplained, unlabeled orphan item** (2/4 auditors) — `src/lib/link.ts:148-160`: `storeItemShell` commits the item row (with a working encrypted token) before `Promise.all([getItem, getAccounts])`; if either fails, the error propagates to a generic 500/502 and nothing records a per-item error. The row survives with no institution name, no accounts, and no `items.error`, then appears on the home page as a raw `itemId` with no explanation; the user's only remedy is noticing the mystery row and removing it. Related: `getItem` is not wrapped in `retryOnce` while its parallel sibling `getAccounts` is, so a transient blip on `getItem` hard-fails a link that would have self-healed a moment later. Sits just outside `initial-sync-reported-not-thrown`'s guarantee — either extend the report-don't-throw pattern to enrichment or record the gap as accepted.

- **Sync pool usage can exceed the documented "well below pool max" margin** (1 auditor; corroborated by a performance finding on the unpinned pool `max`) — `withItemSyncLock` (`src/lib/sync-lock.ts:12-42`) holds a dedicated pool connection for the whole critical section while `runSyncItem` opens a second connection for its persistence transaction, so each in-flight item holds two connections during that window. At `SYNC_CONCURRENCY = 3` that's up to 6 of the default 10, leaving 4 for concurrent UI requests (some of which take row locks) — narrower headroom than the one-connection-per-item arithmetic in `cross-process-sync-lock.md`/`scheduled-sync.md` assumes. Exhaustion would surface as 10s `connectionTimeoutMillis` failures on ordinary page loads.

- **No incremental checkpointing across a `transactionsSync` page drain** (2/4 auditors; one notes it is already accepted) — `src/lib/plaid.ts:249-302`: up to 200 pages accumulate in memory and the cursor persists only after the full drain commits, so a late-page failure discards the whole attempt. Explicitly evaluated and accepted in `bounded-cursor-hold.md` (2026-09-07) on small-initial-sync grounds; carried here only because it remains the one long-running operation with no partial-progress path, per that record's own revisit trigger.

# Minor Concerns

- **`items.error` collapses two independent failure signals into one field** (2 auditors) — `src/lib/sync-outcome.ts:52-65` writes either the skipped-rows message or `ACCOUNT_REFRESH_FAILED_MESSAGE`, never both; if a cycle both skips rows and fails an account refresh, one fault is silently under-reported.

- **`listTransactions` reads its page and total count non-atomically** (3 auditors) — `src/lib/transactions.ts:24-43`; a sync committing between the two queries can make `total` inconsistent with the page, confusing last-page clamping in `useTransactionPage.ts`. Low impact at single-user 60s-poll scale.

- **Key-rotation script has no batch atomicity or partial-completion reporting** (1 auditor) — `scripts/rotate-encryption-key.ts:30-45` updates row-by-row; an interrupt leaves a mixed table. Recoverable in practice (`decrypt()` falls back to `ENCRYPTION_KEY_PREVIOUS`; rerun is idempotent) but that property is undocumented and the operator gets no partial-completion signal. (The compatibility report's moderate finding on this same script racing live relinks is the sharper edge.)

- **Item deletion is not atomic across Plaid and the local DB** (1 auditor) — `src/lib/items.ts:33-42`: if Plaid's `removeItem` succeeds and the local delete fails, the row survives pointing at an invalidated token. Self-heals on retry (`ITEM_NOT_FOUND` treated as success); noted for completeness.

- **No backoff for Plaid 429 responses** (2 auditors) — treated as a hard 4xx and retried only at the next hourly tick. A recorded, deliberately deferred gap (`transient-plaid-retry.md`); listed for completeness, not re-litigated.
