---
characteristic: "compatibility"
---
# Summary

Real progress: both prior Moderate concerns were fixed at the code level in commit `da6bbb8` and recorded in design records — Plaid HTTP 429 is now treated as transient with `Retry-After`-aware backoff capped at 30s (`src/lib/plaid.ts:127-142`, `transient-plaid-retry.md`), and the Postgres advisory lock now uses the namespaced two-int form with a fixed `LOCK_CLASS_ID` ("SPR1") (`src/lib/sync-lock.ts`, `cross-process-sync-lock.md`). All four auditors verified both fixes directly in code.

The six prior Minor concerns all remain open and unchanged. One auditor surfaced one new Minor: the sync-lock fix itself now depends on an untyped `pg` internal under a caret dependency range. Independent sweeps of webhook surface (none, by design), CORS/content-type posture, cross-platform scripts, currency/locale handling in the new `money.ts`, and migration sequencing found everything else sound.

Totals: 0 Major, 0 Moderate (2 prior resolved this cycle), 7 Minor (6 prior + 1 new).

# Major Concerns

None.

# Moderate Concerns

None open. `[prior — resolved]` Plaid 429 handling and `[prior — resolved]` advisory-lock namespacing, both fixed in `da6bbb8` as described above.

# Minor Concerns

- `[prior]` **Legacy Plaid `category` fallback collapses distinct null cases.** `src/lib/plaid.ts:215` (`personal_finance_category?.primary ?? txn.category?.[0] ?? null`) can't distinguish "genuinely uncategorized" from "both source fields absent."
- `[prior]` **`base64ImageMime` recognizes only PNG/JPEG/GIF/WebP.** `src/lib/image-mime.ts` — any other format Plaid returns for an institution logo 404s at `GET /api/items/[itemId]/logo`. Partially improved: `item-logo-served-separately.md` now records the 404 as intended behavior, but the unsupported-format gap itself is not enumerated as a limitation.
- `[prior]` **Plaid product/country config validated against the full SDK enum rather than the ingest-supported subset.** `src/lib/plaid.ts:88-112` — e.g. `liabilities` passes config validation but has no adapter and is silently unused.
- `[prior]` **No declared browser baseline for the client bundle.** `src/lib/http.ts:33` uses `AbortSignal.timeout()` (and the new `src/lib/money.ts` adds `Intl.NumberFormat` with `currencyDisplay: 'narrowSymbol'`) with no `browserslist` or stated minimum anywhere, unlike the explicit Node and Postgres floors.
- `[prior]` **No `application_name` on the shared Postgres pool.** `src/lib/pool-config.ts` — SpendRight's sessions are indistinguishable in `pg_stat_activity` on a shared instance.
- `[prior]` **`normalizeAccountName` does no Unicode normalization.** `src/lib/cards.ts:3-5` is `trim().toLowerCase()` only; NFC/NFD variants of a visually identical name fail the exact match. Narrow edge case within the accepted exact-match design.
- `[new]` **Sync-lock `query_timeout` override relies on an untyped `pg` internal under an unpinned caret range.** `src/lib/sync-lock.ts:33-37` passes a per-query `query_timeout` cast around `@types/pg`'s `QueryConfig` (which lacks the field); the behavior was verified against `pg@8.23.0`, but `package.json` pins `"pg": "^8.23.0"`, so a routine update could silently change the internal precedence and reintroduce the client-side-timer bug the fix just closed. Partially mitigated: `scripts/check-verified-claims.mjs` asserts the installed version matches the "Verified-on" comment and would flag a bump. Consider pinning `pg` or adding a behavioral regression check.
