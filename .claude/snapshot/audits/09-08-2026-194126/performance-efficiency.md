---
characteristic: 'performance efficiency'
---

# Summary

All three auditors returned clean passes. The prior Moderate concern (unbounded `inArray` calls risking Postgres's 65,535 bind-parameter cap) remains resolved — every bulk call site chunks through `chunkArray(ids, DB_CHUNK_SIZE)` (`src/lib/chunk.ts`, size 500). The prior Minor concern (uncached `Intl.NumberFormat` construction in `formatMoney`) is now resolved: `src/lib/money.ts:7-20` caches formatters in a `Map` keyed by currency code with a lazily-created plain-formatter fallback. Index coverage matches every hot query path, the pool/concurrency invariant is enforced by a startup assertion (`src/lib/sync-all.ts:31-36`), the Plaid drain is bounded, and client polling is visibility-gated. All deferred scale trade-offs (offset pagination, unconditional 60s polling, sequential per-account upserts, single-process in-memory coordination, no mid-drain checkpointing) remain explicitly blessed by SNAPSHOT.md.

# Major Concerns

None.

# Moderate Concerns

None.

# Minor Concerns

None.

# Resolved since prior audit

- `[prior → resolved]` Uncached `Intl.NumberFormat` construction in `formatMoney` — `src/lib/money.ts:7-20` now caches per-currency formatters.

# Unscored observation (carried for continuity)

- `src/app/page.tsx:193` filters the full `accountList` inside `itemList.map()` per render (O(items × accounts)) rather than pre-grouping by `itemId`. Immaterial at current single-user scale; noted by all three auditors, scored by none.
