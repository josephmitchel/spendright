---
characteristic: "reliability"
---
# Summary

All three prior Moderate concerns are resolved in commit `da6bbb8`, each verified directly (one auditor read the installed `pg@8.23.0` source to confirm the fix works rather than trusting the comment): the sync lock now passes a per-query `query_timeout` override so the server-side `lock_timeout`/`55P03` cancel wins as designed (`src/lib/sync-lock.ts:33-37`); Plaid 429s are now retried with `Retry-After`-aware backoff (`src/lib/plaid.ts:127-142`); and `sync-all.ts`'s pool-usage comment now correctly counts two connections per in-flight item.

Six prior Minor concerns remain open and unchanged. One auditor surfaced one new Minor in the key-rotation script's lack of per-row fault isolation. Independent sweeps of the link flow, sync persistence, client-side load/retry protocol, error-response plumbing, process supervision, and startup validation found the reliability posture deliberate and well-documented — bounded waits everywhere, partial failures reported rather than thrown, single-flight/serialization guards against races.

Totals: 0 Major, 0 Moderate (3 prior resolved this cycle), 7 Minor (6 prior + 1 new).

# Major Concerns

None.

# Moderate Concerns

None open. `[prior — resolved]` ×3: the `query_timeout`/lock-wait race, unretried Plaid 429s, and the pool-usage comment undercount — all fixed in `da6bbb8` as described above.

# Minor Concerns

- `[prior]` **`removeItem` and `getInstitutionById` lack the `retryOnce` wrapper** applied to every other Plaid call (`src/lib/plaid.ts:228-242, 249-252`), inconsistent with the `transient-plaid-retry.md` policy; a transient blip during item removal or institution-metadata refresh fails outright.
- `[prior]` **`items.error` collapses two independent failure signals into one column.** `src/lib/sync-outcome.ts:57-62` writes either the skipped-rows message or `ACCOUNT_REFRESH_FAILED_MESSAGE`, never both, so one failure mode can mask the other on the same sync.
- `[prior]` **`listTransactions` reads the page and total count non-atomically.** `src/lib/transactions.ts:19-44` — two separate `SELECT`s with no shared snapshot; a concurrent sync commit between them can desync `total` from the returned page.
- `[prior]` **Item deletion is not atomic across Plaid and the local DB.** `removeItemCompletely` (`src/lib/items.ts:31-55`) — if `itemRemove` succeeds but the `db.delete` fails, the row survives pointing at an invalidated token, self-healing only via a later `ITEM_NOT_FOUND` on manual retry.
- `[prior]` **No retry/backoff for a transiently unavailable Postgres at startup.** `src/instrumentation.ts:9-19` → `assertSupportedPostgres()` (`src/lib/db.ts:27-36`) treats any connection failure as fatal; combined with `start.mjs`'s 3-restarts-in-60s guard, a co-started Postgres that takes slightly too long to become ready can exhaust the restart budget before the database is up.
- `[prior]` **The crash-loop guard can be defeated by a slow, persistent crash cycle.** `scripts/start.mjs:61-70` counts restarts only within a rolling 60s window; a fault that crashes the server every ~60-70s never trips the guard, so the supervisor restarts forever instead of surfacing the hard stop `process-crash-backstop.md` intends.
- `[new]` **`scripts/rotate-encryption-key.ts` aborts the whole rotation on the first undecryptable row.** The per-row loop has no try/catch around `decrypt(row.accessToken)`; one corrupted token propagates past the loop (skipping the "Re-encrypted X of Y" summary) and, since reruns stop at the same row, blocks rotation for every item indefinitely — unlike the per-row isolation pattern used in `storeAccounts`/`sync-all`. A narrow operational-script gap rather than a user-facing risk.
