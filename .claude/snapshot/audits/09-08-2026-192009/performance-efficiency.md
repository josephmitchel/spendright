---
characteristic: 'performance efficiency'
---

# Summary

All three auditors independently converged on the same picture: the performance posture is clean and disciplined, with every scale trade-off (offset pagination, unconditional 60s polling, sequential per-account upserts, single-process in-memory coordination, no mid-drain checkpointing) matching what SNAPSHOT.md explicitly blesses as deferred. The prior audit's one Moderate concern — unbounded `inArray` calls in the sync pipeline risking Postgres's 65,535 bind-parameter cap — was verified as resolved by all three auditors: both call sites (`src/lib/sync.ts:91-94` removed-id delete, `src/lib/sync-carry.ts:41-55` pending-id lock read) now chunk via the shared `chunkArray(ids, ID_CHUNK_SIZE)` helper (`src/lib/chunk.ts`, size 500, matched to `UPSERT_CHUNK_SIZE`), fixed in commit `fbf2912`. Pool sizing (`max: 10` vs `SYNC_CONCURRENCY = 3` at two connections per in-flight item), index coverage of all hot query paths, the bounded Plaid drain (200 pages × 500 rows), and client polling behavior (`useVisiblePoll`) were all re-verified as correct. One prior Minor concern remains open. No new concerns were found by any auditor.

# Major Concerns

None.

# Moderate Concerns

None. (The prior Moderate — unbounded `inArray` in the sync pipeline — is resolved and verified by all three auditors.)

# Minor Concerns

- `[prior]` **Uncached `Intl.NumberFormat` construction in `formatMoney`** (`src/lib/money.ts:14`, `:23`). Still constructs a fresh `Intl.NumberFormat` on every call with no cache keyed by currency code, and it is invoked per transaction row and per account row on every render, 60s poll, page turn, and post-PATCH re-render. Impact is negligible at current single-user/single-card scale; the fix (a `Map<currencyCode, Intl.NumberFormat>` cache) is trivial and zero-risk. Unaddressed since the prior audit.

Sub-minor observation (not scored, noted for a future cleanup batch): `src/app/page.tsx:171` filters the full `accountList` inside `itemList.map()` on every render (O(items × accounts)) rather than pre-grouping by `itemId` — immaterial at current row counts.
