---
characteristic: "compatibility"
---
# Summary

All four auditors agree: the two prior Moderate concerns (Plaid 429 handling with `Retry-After`-aware backoff; namespaced two-int advisory lock) remain fixed, the same seven prior Minor concerns remain open, and no new concerns surfaced. One previously-unstated gap — the Postgres version floor — was confirmed resolved this cycle via `assertSupportedPostgres()` (`src/lib/db.ts`, called from `src/instrumentation.ts`) plus documentation in `runtime-version-floors.md`. Independent sweeps covered the webhook-free design (recorded as intentional), the provider-adapter boundary, CORS/CSP posture, cross-platform scripts, currency/locale handling, and migrations discipline; accepted risks already recorded in `deployment-boundaries.md` and `deferred-features.md` were respected and not re-raised.

Totals: 0 Major, 0 Moderate, 7 Minor (all prior, 0 new).

# Major Concerns

None.

# Moderate Concerns

None.

# Minor Concerns

- `[prior]` **Legacy Plaid `category` fallback collapses distinct null cases.** `src/lib/plaid.ts:216` — `personal_finance_category?.primary ?? txn.category?.[0] ?? null` can't distinguish "genuinely uncategorized" from "both source fields absent." (Flagged by all 4 auditors.)

- `[prior]` **`base64ImageMime` recognizes only PNG/JPEG/GIF/WebP.** `src/lib/image-mime.ts` — any other institution-logo format Plaid returns 404s at `GET /api/items/[itemId]/logo`; the 404 behavior is documented as intended (`item-logo-served-separately.md`) but the format gap isn't enumerated as a stated limitation. (Flagged by all 4 auditors.)

- `[prior]` **Plaid product/country config validated against the full SDK enum, not the ingest-supported subset.** `src/lib/plaid.ts:88-112` — e.g. `liabilities` passes `PLAID_PRODUCTS` validation but has no adapter and is silently unused. (Flagged by all 4 auditors.)

- `[prior]` **No declared browser baseline for the client bundle.** `src/lib/http.ts:33` (`AbortSignal.timeout()`) and `src/lib/money.ts` (`Intl.NumberFormat` with `currencyDisplay: 'narrowSymbol'`) ship with no `browserslist` or stated minimum anywhere — in contrast to the explicit Node and Postgres floors the repo otherwise pins and checks. (Flagged by all 4 auditors.)

- `[prior]` **No `application_name` on the shared Postgres pool.** `src/lib/pool-config.ts` — SpendRight's sessions are indistinguishable from any other client in `pg_stat_activity` on a shared instance, which matters for co-existence diagnostics. (Flagged by all 4 auditors.)

- `[prior]` **`normalizeAccountName` does no Unicode normalization.** `src/lib/cards.ts:3-5` is `trim().toLowerCase()` only; NFC/NFD variants of a visually identical account name fail the exact match. Narrow edge case within the accepted exact-match design. (Flagged by all 4 auditors.)

- `[prior]` **Sync-lock `query_timeout` override relies on an untyped `pg` internal under an unpinned caret range.** `src/lib/sync-lock.ts:33-37` casts around `@types/pg`'s `QueryConfig`, verified against `pg@8.23.0` while `package.json` pins `"pg": "^8.23.0"`. `scripts/check-verified-claims.mjs` mitigates by asserting the installed version matches the `Verified-on` comment (it compares major.minor, so it would catch a 8.23.x → 8.24.x bump), but the reliance on undocumented internal precedence is unchanged. (Flagged by all 4 auditors.)
