---
characteristic: "performance efficiency"
---
# Summary

All four auditors reached the same conclusion independently: performance efficiency remains the most disciplined characteristic in the codebase. The same five Minor concerns from the previous audit (09-07-2026-211746) are still present and unaddressed; no new concerns were found. Auditors confirmed sound patterns throughout: bounded sync page/retry budgets in the Plaid client (`MAX_SYNC_PAGES = 200`), chunked upserts under the bind-parameter cap (`UPSERT_CHUNK_SIZE = 500`), bounded sync concurrency vs. pool size (3 vs. 10), deadlines on every DB/Plaid boundary, clamped pagination, a day-cached logo endpoint, and visibility-gated 60s client polling. The sync lock's `client.release(true)` was re-verified by multiple auditors as a deliberate, recorded design decision (`cross-process-sync-lock`), not a finding.

Totals: 0 Major, 0 Moderate, 5 Minor (all prior, 0 new).

# Major Concerns

None.

# Moderate Concerns

None.

# Minor Concerns

- `[prior]` **Linear account-list filter inside a list render.** `src/app/page.tsx:166` — `accountList.filter((account) => account.itemId === item.itemId)` runs inside `itemList.map(...)`, O(items × accounts) on every render, including every 60s `useVisiblePoll` tick. A pre-grouped `Map<itemId, accounts[]>` would remove the repeated scans. (Flagged by all 4 auditors.)

- `[prior]` **Composite transaction index doesn't cover the sort tie-breaker.** `src/db/schema.ts:136` defines `transactions_account_date_idx` on `(accountId, date desc)` only, while `listTransactions` (`src/lib/transactions.ts:34`) orders by `date desc, id desc`, forcing an in-memory sort for same-date rows. Extending the index to `(accountId, date desc, id desc)` would let Postgres serve the sort from the index. (Flagged by all 4 auditors.)

- `[prior]` **Sequential per-account DB transactions during account refresh.** `storeAccounts` (`src/lib/accounts.ts:79-99`) awaits each account's `db.transaction(...)` serially in a `for` loop. Per-account fault isolation is a recorded design choice but doesn't require serialization; `Promise.allSettled` would preserve isolation while cutting wall-clock latency for multi-account items. (Flagged by all 4 auditors.)

- `[prior]` **`loadCardCatalog` re-queried per item during multi-item sync.** `refreshItemAccounts` (`src/lib/accounts.ts:101-107`) calls `loadCardCatalog(db)` on every invocation, and `runSyncItem` (`src/lib/sync.ts:66`) invokes it once per item from `sync-all.ts`'s worker pool — so a sync-all over N institutions queries the cards table N times instead of once. (Flagged by all 4 auditors.)

- `[prior]` **Unscoped `SELECT *` on `items` in hot per-sync paths.** `src/lib/sync.ts:47`, `src/lib/link.ts:143`, and `src/lib/items.ts:33` pull every column — including the `institutionLogo` base64 blob — when only a few fields are needed. Negligible at current single-user scale but unaddressed. (Flagged by all 4 auditors.)
