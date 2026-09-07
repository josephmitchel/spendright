---
characteristic: "reliability"
---
# Summary

Five auditors independently confirmed that this codebase has an unusually mature reliability posture: prior hardening rounds (recorded in `.claude/design/current/`) already cover Plaid/HTTP deadlines, bounded retry and cursor-hold budgets, per-item sync serialization with single-flight dedup, pool idle-error logging, token-before-enrichment ordering, `for('update')` row locks where races matter, fail-fast startup validation, and idempotent Plaid-first deletion — all verified intact in the current source.

Two genuine gaps dominate the findings, each surfaced independently by multiple auditors: **the database is the one network dependency with no deadlines at all**, and **there is no Plaid re-authentication (Link update mode) path**, making a routine `ITEM_LOGIN_REQUIRED` state permanently unrecoverable without destroying that institution's data. A third recurring theme is the total absence of React error boundaries.

# Major Concerns

- **No Plaid Link "update mode" — the only recovery from an expired connection destroys data** (flagged by 3 of 5 auditors, rated Major by 2) — `src/lib/plaid.ts:115-126` (`createLinkToken`) never forwards an `access_token`, so Link can only mint brand-new items. When an item enters `ITEM_LOGIN_REQUIRED`/`PENDING_EXPIRATION` (a routine occurrence in Plaid's lifecycle), every hourly and manual sync fails identically forever — `src/lib/sync-all.ts:26-36` records the failure but there is no escalation and no self-service fix. The only recovery is `DELETE /api/items/[itemId]`, whose FK cascades (`src/db/schema.ts:80,105,108`) permanently delete all accounts, transactions, category assignments, and reward-rate history for that institution; re-linking mints unrelated new IDs. A direct Recoverability violation with no design record accepting it.

- **No timeout on Postgres connection acquisition or query execution** (flagged by 4 of 5; rated Major by 1) — `src/lib/db.ts:22-26` creates the `pg.Pool` with only `connectionString`: no `connectionTimeoutMillis` (default = wait forever), `statement_timeout`, or `query_timeout` anywhere (also `scripts/seed-cards.ts:207-210`). The repo's own `requests-have-deadlines` principle — added specifically because "a hung request… latches the sync guards or wedges a page… forever" — was never extended to the database. A stuck query or exhausted pool silently wedges the per-item sync lock and the sync-all single-flight guard with no log line, requiring a manual restart: exactly the invisible-outage failure mode the Plaid/fetch timeouts were built to prevent.

# Moderate Concerns

- **No React error boundary anywhere in the App Router** (flagged by 3 of 5) — no `error.tsx`/`global-error.tsx` exists under `src/app`; `src/app/layout.tsx:8-14` is a bare shell. Every fetch-level failure is deliberately contained (`useLoadProtocol`, `ErrorNotice`, the `partial-load-rendering` design family), but an unhandled render-time exception in any client component blanks the entire route to Next's default error UI with no retry affordance. The one reliability-relevant area with no design record — likely never considered rather than deferred.

- **No incremental checkpointing across a `transactionsSync` page drain** — `src/lib/plaid.ts:223-274` accumulates up to 200 pages in memory; the cursor persists only once at the end of `runSyncItem`'s transaction (`src/lib/sync.ts:65-91`, `sync-outcome.ts:52-65`). Any mid-drain exception discards all fetched pages and the retry restarts from the same cursor — for a large backlog over flaky connectivity there is no forward-progress guarantee.

- **Sync's row locks have no `lock_timeout`** — `src/lib/sync-outcome.ts:43-47` and `src/lib/sync-carry.ts:41-50` take `for('update')` locks with no bound, unlike `src/lib/categories.ts:84` which deliberately caps its lock wait at 3s; same silent-hang class as the DB-timeout finding.

- **No permanent-vs-transient distinction or generic retry for Plaid errors** — `syncTransactions` retries only the empty-`next_cursor` "not ready" case (`plaid.ts:255-264`); a single transient 5xx on `transactionsSync` or `accountsGet` fails the item's whole attempt. The hourly path self-heals, but a manual "Sync all" surfaces a hard failure for a one-off blip, and permanently broken items are retried hourly forever with no backoff (`sync-all.ts:21-40`).

# Minor Concerns

- **Sequential per-item sync has no per-item wall-clock budget** — `src/lib/sync-all.ts:25-37`; one slow institution delays all others, and with the 120s client fetch deadline (`src/lib/http.ts:8`) a manual sync of several institutions can abort client-side (primary write-up under Performance Efficiency).
- **Institution metadata never self-heals** — `src/lib/link.ts:132-143`; if enrichment fails after `storeItemShell`, name/logo stay `null` until a manual re-link (underlying ordering is a documented, sound decision; the residual gap is the missing backfill).
- **Item deletion can orphan a row** — `src/app/api/items/[itemId]/route.ts:33-39`; Plaid revoke succeeding + local delete failing leaves a dead item row.
- **`items.error` is a single field** — `src/lib/sync-outcome.ts:57-62`; a skipped-row message can mask a concurrent account-refresh failure.
- **`linkItem`'s parallel enrichment surfaces a bare error despite a durable partial success** — `src/lib/link.ts:135-140`.
