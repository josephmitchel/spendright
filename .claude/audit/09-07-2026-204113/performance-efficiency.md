---
characteristic: "performance efficiency"
---
# Summary

All four auditors independently converged: no Major or Moderate concerns, and the same four Minor concerns from the prior audit (09-07-2026-184757) remain present and unaddressed — none fixed, none escalated. One auditor surfaced one new very-minor finding (`SELECT *` on `items` in hot per-sync paths). Performance remains the most disciplined characteristic in the codebase: explicit deadlines on every DB/Plaid boundary, bounded sync concurrency, chunked upserts under the bind-parameter cap, clamped pagination, day-cached logo endpoint, and visibility-aware polling. Previously accepted trade-offs (unpaginated `GET /api/items`/`GET /api/accounts`, separate `count(*)` in `listTransactions`) remain documented design decisions and are not raised as findings.

# Major Concerns

None.

# Moderate Concerns

None.

# Minor Concerns

- `[prior]` **Linear account-list filter inside a list render.** `src/app/page.tsx:159` runs `accountList.filter((account) => account.itemId === item.itemId)` inside `itemList.map(...)`, making the render O(items × accounts) on every 60s poll tick. A pre-grouped `Map<itemId, accounts[]>` would remove the redundant scans. (Flagged by all 4 auditors.)
- `[prior]` **Composite transaction index doesn't cover the sort tie-breaker.** `transactions_account_date_idx` (`src/db/schema.ts:136`) covers `(accountId, date desc)` while `listTransactions` (`src/lib/transactions.ts:34`) orders by `date desc, id desc`, forcing an extra in-memory sort for same-date rows. Extend the index to `(accountId, date desc, id desc)`. (Flagged by all 4 auditors.)
- `[prior]` **Sequential per-account DB transactions during account refresh.** `storeAccounts` (`src/lib/accounts.ts:79-99`) awaits each account's `db.transaction(...)` serially in a `for` loop. Per-account isolation is a recorded design choice (`accounts-refreshed-per-sync.md`) but doesn't require serialization; `Promise.allSettled` would preserve fault isolation while cutting wall-clock latency. (Flagged by all 4 auditors.)
- `[prior]` **`loadCardCatalog` re-queried per item during multi-item sync.** `refreshItemAccounts` (`src/lib/accounts.ts:105`) calls `loadCardCatalog(db)` on every invocation, so a sync-all over N institutions queries the (currently single-row) cards table N times instead of once. Distinct from the `single-card-catalog-loader.md` consolidation record, which covers query logic/failure policy rather than call frequency. (Flagged by all 4 auditors.)
- `[new]` **Unscoped `SELECT *` on `items` in hot per-sync paths.** `src/lib/sync.ts:47` and `src/lib/link.ts:140` (and `src/lib/items.ts:33`) select all columns — including the `institutionLogo` base64 blob — when only `accessToken`/`cursor` or a small field subset is used. Negligible now; select only needed columns. (Flagged by 1 of 4 auditors.)
