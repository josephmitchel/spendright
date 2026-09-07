---
characteristic: "performance efficiency"
---
# Summary

Four auditors assessed performance efficiency (ISO/IEC 25010:2023 §3.2). Consensus: the codebase's performance posture is deliberate and well-recorded — deadlines exist at every network/DB boundary (`requests-have-deadlines`), sync concurrency and page/retry budgets are bounded, pagination is enforced on both sides, upserts are chunked to the bind-parameter cap, indexes match query shapes, and client polling is bounded and visibility-aware. No code was found violating a stated performance design decision; two auditors reported no findings at all beyond accepted trade-offs. One moderate concern (logo payload on every poll) and a handful of small residual inefficiencies were surfaced, none covered by an existing design record.

# Major Concerns

None.

# Moderate Concerns

- **Institution logo (base64 blob) is retransmitted on every 60-second poll, for every institution, indefinitely** (1 auditor) — `GET /api/items` (`src/app/api/items/route.ts`) serves `publicItemColumns` (`src/lib/items.ts`), which excludes only `accessToken`, so `items.institutionLogo` rides along on every poll response (`home-reflects-background-sync.md`, `useVisiblePoll` at 60s). The logo is effectively static (changes only on link/relink per `relink-preserves-institution-metadata`), yet there is no cache header, ETag, or split between slow-changing institution metadata and fast-changing status fields. Waste scales with poll frequency × linked institutions × logo size, and it undermines the "payloads are two small loopback reads" justification the polling design record gives for choosing polling over push.

# Minor Concerns

- **Postgres pool `max` is left at the driver's implicit default (10)** (1 auditor; corroborated by a reliability finding) — `src/lib/db.ts` tunes timeouts explicitly but never sets `max`, while `scheduled-sync.md`/`cross-process-sync-lock.md` reason about capacity headroom against that exact number. A `pg` upgrade or `Pool` refactor could silently move the ceiling with no failing check. (See also the reliability report's moderate finding that each syncing item can hold two pool connections at once, tightening this same margin.)

- **Linear account-list filter inside a list render** (2 auditors) — `src/app/page.tsx:152-160`: `accountList.filter(a => a.itemId === item.itemId)` inside `itemList.map(...)` is O(items × accounts) per render, re-run on every 60s poll. Negligible at current scale; a pre-grouped `Map` is a trivial future cleanup.

- **Composite transaction index doesn't cover the tie-breaker sort column** (1 auditor) — `transactions_account_date_idx` (`src/db/schema.ts:136`) covers `(accountId, date desc)` but `listTransactions` sorts by `date desc, id desc` (`src/lib/transactions.ts:34`); same-date rows need an extra in-memory sort step. Negligible now; extending the index to include `id` would fully satisfy the sort.

- **Sequential per-account DB transactions during account refresh** (1 auditor) — `src/lib/accounts.ts` `storeAccounts()` (79-99) awaits each account's transaction in series. Isolation is a recorded decision (`accounts-refreshed-per-sync.md`) but doesn't require serialization; `Promise.allSettled` would preserve independent failure while cutting latency. Immaterial at current account counts.

- **Already-recorded trade-offs, noted only for completeness** — the separate `count(*)` query in `listTransactions` (documented in `transactions-paginated.md`) and the unpaginated `/api/items`/`/api/accounts` list endpoints (in-scope for the accepted single-user scale). No action implied.
