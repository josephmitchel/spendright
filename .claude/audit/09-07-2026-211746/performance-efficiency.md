---
characteristic: "performance efficiency"
---
# Summary

All four auditors found the same five prior Minor concerns still present and unaddressed, and no Major or Moderate concerns. Performance efficiency remains the most disciplined characteristic in the codebase: deadlines on every DB/Plaid boundary, bounded sync concurrency (`SYNC_CONCURRENCY = 3` vs pool `max: 10`), chunked upserts under the bind-parameter cap, clamped pagination, day-cached logo endpoint, and visibility-gated client polling.

One auditor raised the sync lock's `client.release(true)` (destroying the physical connection after every sync) as a new concern, but two other auditors independently verified it is a deliberate, recorded design decision in `.claude/design/current/cross-process-sync-lock.md` (a session-scoped advisory lock and `SET lock_timeout` must not leak into a reused pooled connection), so it is not counted as a finding.

Totals: 0 Major, 0 Moderate, 5 Minor (all prior, 0 new).

# Major Concerns

None.

# Moderate Concerns

None.

# Minor Concerns

- `[prior]` **Linear account-list filter inside a list render.** `src/app/page.tsx:166` runs `accountList.filter((account) => account.itemId === item.itemId)` inside `itemList.map(...)` — O(items × accounts) on every render, including every 60s poll tick (`useVisiblePoll`). A pre-grouped `Map<itemId, accounts[]>` would remove the repeated scans.
- `[prior]` **Composite transaction index doesn't cover the sort tie-breaker.** `transactions_account_date_idx` (`src/db/schema.ts:136`) covers `(accountId, date desc)` while `listTransactions` (`src/lib/transactions.ts:34`) orders by `date desc, id desc`, forcing an in-memory sort for same-date rows. Extend the index to `(accountId, date desc, id desc)`.
- `[prior]` **Sequential per-account DB transactions during account refresh.** `storeAccounts` (`src/lib/accounts.ts:79-99`) awaits each account's `db.transaction(...)` serially in a `for` loop. Per-account fault isolation is a recorded design choice but doesn't require serialization — `Promise.allSettled` would preserve isolation while cutting wall-clock latency.
- `[prior]` **`loadCardCatalog` re-queried per item during multi-item sync.** `refreshItemAccounts` (`src/lib/accounts.ts:105`) calls `loadCardCatalog(db)` on every invocation, so a sync-all over N institutions queries the cards table N times instead of once.
- `[prior]` **Unscoped `SELECT *` on `items` in hot per-sync paths.** `src/lib/sync.ts:47`, `src/lib/link.ts:143`, and `src/lib/items.ts:33` pull every column — including the `institutionLogo` base64 blob — when only a few fields are needed. Negligible at current scale but unaddressed.
