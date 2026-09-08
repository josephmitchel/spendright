---
characteristic: "performance efficiency"
---
# Summary

Four independent auditors reviewed the codebase against ISO/IEC 25010:2023 §3.2 and reached unanimous agreement: no Major or Moderate concerns. The performance posture is deliberate and well-documented in `.claude/design` — explicit deadlines on every DB/network boundary (`src/lib/pool-config.ts`, `requests-have-deadlines.md`), bounded sync concurrency (`SYNC_CONCURRENCY = 3` in `src/lib/sync-all.ts`), clamped server/client transaction pagination, chunked upserts under the Postgres bind-parameter cap, and visibility-aware 60s polling (`src/hooks/useVisiblePoll.ts`).

All four auditors independently confirmed that the two moderate issues from the prior audit round are fixed in the current tree:
- Institution logo no longer rides every 60s `/api/items` poll — split into a `hasLogo` flag plus a separately fetched, day-cached `GET /api/items/[itemId]/logo` (`src/lib/items.ts`, `src/app/api/items/[itemId]/logo/route.ts`).
- Postgres pool `max` is now set explicitly to 10 (`src/lib/pool-config.ts`), matching the sync concurrency budget.

Remaining findings are small residual inefficiencies, all immaterial at the project's declared single-user/single-card scale.

# Major Concerns

None.

# Moderate Concerns

None.

# Minor Concerns

- **Linear account-list filter inside a list render** (flagged by 4/4 auditors) — `src/app/page.tsx:159`: `accountList.filter((account) => account.itemId === item.itemId)` runs inside `itemList.map(...)`, making the render O(items × accounts) and re-running on every 60s poll tick. Negligible now; a pre-grouped `Map<itemId, accounts[]>` would remove the redundant scans if item/account counts grow.

- **Composite transaction index doesn't cover the sort tie-breaker** (4/4) — `transactions_account_date_idx` (`src/db/schema.ts:136`) covers `(accountId, date desc)`, but `listTransactions` orders by `date desc, id desc` (`src/lib/transactions.ts:34`), so same-date rows require an extra in-memory sort step. Extending the index to `(accountId, date desc, id desc)` would let the ORDER BY be fully index-served.

- **Sequential per-account DB transactions during account refresh** (4/4) — `src/lib/accounts.ts:79-99` (`storeAccounts`) awaits each account's own `db.transaction(...)` in series. Per-account isolation is a recorded design choice (`accounts-refreshed-per-sync.md`) but doesn't require serialization — `Promise.allSettled` over per-account transactions would preserve fault isolation while cutting wall-clock latency proportionally to account count. Immaterial at current account counts.

- **`loadCardCatalog` re-queried per item during multi-item sync** (1/4) — `src/lib/accounts.ts:105` (`refreshItemAccounts`) calls `loadCardCatalog(db)` once per item during `runSyncAll`, so the cards table is queried N times per sync-all run with N institutions instead of once. Possibly intentional (rematch-on-every-sync freshness); low-cost optimization if the catalog or institution count grows.

## Accepted trade-offs (recorded in design, no action implied)

- `listTransactions` issues a separate `count(*)` query alongside the page query — documented in `transactions-paginated.md`.
- `GET /api/items` and `GET /api/accounts` return unpaginated full lists — in scope for the accepted single-user/early-stage scale; revisit the Capacity envelope before multi-user or large-portfolio use.
