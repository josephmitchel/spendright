---
characteristic: 'performance efficiency'
---

# Summary

All three auditors returned clean passes. Both concerns from earlier in the era remain resolved: uncached `Intl.NumberFormat` construction in `formatMoney` (now cached per-currency in `src/lib/money.ts:7-20`) and unbounded `inArray`/bulk calls risking Postgres's 65,535 bind-parameter cap (all volume-scaled call sites — `src/lib/sync-persist.ts:135`, `src/lib/sync-carry.ts:42`, `src/lib/sync.ts:92` — chunk through `chunkArray(ids, DB_CHUNK_SIZE)`; the remaining unchunked `inArray` sites operate on inherently small deduplicated id sets). Fresh sweeps of the sync engine, pool/concurrency invariant, schema indexes, pagination, visibility-gated polling, category-write coalescing, and formatter caches found nothing that violates time behaviour, resource utilization, or capacity expectations at the single-user scale SNAPSHOT.md establishes.

All three auditors re-noted for continuity the unscored observation that `src/app/page.tsx:193` filters the full `accountList` inside `itemList.map()` (O(items × accounts) per render). Consistent with the prior audits of this era, it remains immaterial at current scale and is deliberately not scored as a concern.

# Major Concerns

None.

# Moderate Concerns

None.

# Minor Concerns

None.
