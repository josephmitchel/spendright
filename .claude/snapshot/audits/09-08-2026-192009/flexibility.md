---
characteristic: 'flexibility'
---

# Summary

All three auditors confirmed the codebase's genuine flexibility mechanisms hold up under independent review: the card catalog is fully data-driven (no card name leaks outside the seed file), `CardType`/`CategoryKind` are compiler-exhaustive extension points, Plaid products/country codes/environment are env-configurable and validated against SDK enums, the Plaid SDK is isolated behind app-owned `Provider*` shapes, money formatting adapts to runtime locale, and pagination constants are single-sourced. Deliberate inflexibilities (single-user, single-process, single-card, no export, no auth) are all snapshot-blessed and were not re-raised. The one prior Minor remains open, and two new Minors surfaced — one of them (the chunk-size duplication) found independently by two auditors and echoing the same structural pattern as the prior finding: a load-bearing cross-file numeric invariant enforced only by comments.

# Major Concerns

None.

# Moderate Concerns

None.

# Minor Concerns

- `[prior]` **Sync-concurrency/pool-size invariant enforced only by comments** (`src/lib/pool-config.ts:17-22`, `src/lib/sync-all.ts:31`). `POOL_CONFIG.max = 10` and `SYNC_CONCURRENCY = 3` (each in-flight item holds up to 2 connections) are set independently in two files. SNAPSHOT.md itself calls the coupling load-bearing, but nothing enforces it — unlike the `sync-lock.ts` timeouts, which are derived arithmetically. A one-line startup assertion (`SYNC_CONCURRENCY * 2 <= POOL_CONFIG.max`) would close it. The `fbf2912` commit touched both files but did not add the assertion. Unaddressed since the prior audit.

- `[new]` **The same unenforced-invariant pattern recurs for chunk sizing** (`src/lib/chunk.ts:3`, `src/lib/sync-persist.ts:43`). `ID_CHUNK_SIZE = 500` (new in `fbf2912`) and `UPSERT_CHUNK_SIZE = 500` are two separate literals bounding different queries against the same 65,535 bind-parameter cap, tied only by a comment claiming they match. A change to either (e.g. widening the upserted column count, which lowers the safe per-chunk row count) would not propagate. Found independently by two auditors (and by a maintainability auditor — reported in both characteristics). Fix: one shared exported constant.

- `[new]` **Plaid Link language is hardcoded while country codes are configurable** (`src/lib/plaid.ts:154-159`). `createLinkToken` sets `language: 'en'` unconditionally even though `country_codes` comes from the validated `PLAID_COUNTRY_CODES` env surface — so pointing the deployment at a non-English-speaking country's banks still renders Link in English. Low impact at the declared single-developer scope, but a small inconsistency in an otherwise deliberately configurable surface.
