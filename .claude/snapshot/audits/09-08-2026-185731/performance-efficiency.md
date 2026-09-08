---
characteristic: 'performance efficiency'
---

# Summary

Three auditors reviewed the sync pipeline, connection pooling, schema/indices, API routes, and client polling/rendering. The performance design is disciplined and internally consistent with SNAPSHOT.md: pool sized against sync concurrency, hot queries indexed, upserts chunked, every wait bounded, and all scale trade-offs (offset pagination, 60s polling, sequential per-account upserts) explicitly blessed by the snapshot's deferred section. One auditor found a genuine capacity gap in the sync pipeline; one found a small render-path inefficiency; the third reported a clean pass. All findings are `[new]` (first audit of the era).

# Major Concerns

None.

# Moderate Concerns

- `[new]` **Unbounded `inArray` calls in the sync pipeline can exceed Postgres's bind-parameter cap.** `src/lib/sync.ts:90` (delete of `removedIds`) and `src/lib/sync-carry.ts:48` (`for('update')` lock on `pendingIds`) pass unchunked arrays accumulated across an entire `transactionsSync` drain — up to 200 pages × 500 rows. `src/lib/sync-persist.ts` chunks its upserts at 500 precisely to stay under the 65,535 bind-parameter cap, but these two sibling queries got no equivalent chunking. An unusually large drain (a long-unsynced item, a bank-side bulk reconciliation) would throw mid-transaction and fail the whole sync where the upsert path would degrade gracefully. Not blessed by the snapshot, which addresses add-volume ("initial syncs pull days") but not removed/carried volume.

# Minor Concerns

- `[new]` **Repeated `Intl.NumberFormat` construction in the money formatter.** `src/lib/money.ts:5-28` (`formatMoney`) builds a fresh formatter on every call; it's called per transaction row (20+/page) and per account row on every 60s poll, page turn, and patch re-render. A small `Map<currencyCode, Intl.NumberFormat>` cache would eliminate the redundant work at zero risk. Impact is negligible at current scale — low-priority cleanup.
