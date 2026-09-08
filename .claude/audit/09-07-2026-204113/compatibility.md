---
characteristic: "compatibility"
---
# Summary

All four auditors converged on the same picture: 0 Major, 2 Moderate, 6 Minor — every finding is prior and still unaddressed at the code level; no new concerns surfaced from independent sweeps (dependency pinning, migrations, currency/timezone handling, CSP/proxy, cross-platform scripts, version-drift guards were all checked fresh and found rigorous). One prior informational item is resolved: the `DATABASE_URL` session-mode requirement is now properly recorded as a dated deployment constraint in `cross-process-sync-lock.md`, so it is no longer carried as an open finding.

# Major Concerns

None.

# Moderate Concerns

- `[prior]` **Plaid HTTP 429 / `RATE_LIMIT_EXCEEDED` is treated identically to a permanent 4xx failure.** `isTransientPlaidFailure` (`src/lib/plaid.ts:120-124`) retries only on missing response or ≥500; a rate-limit response propagates immediately, is recorded as a hard item failure by `runSyncAll`, and can surface the connection-repair UI for what is Plaid's own throttling signal. Recovery waits for the next hourly tick with no backoff. `transient-plaid-retry.md` still defers this without addressing the interoperability angle. (Flagged by all 4 auditors.)
- `[prior]` **Postgres advisory lock uses a bare 64-bit key with no application namespace.** `src/lib/sync-lock.ts:21` uses single-argument `pg_advisory_lock(hashtextextended($1, 0))` in the flat per-database keyspace; `cross-process-sync-lock.md` still doesn't record this as a considered trade-off (namespace via the two-int form, or document that the database is dedicated). (Flagged by all 4 auditors.)

# Minor Concerns

- `[prior]` **Legacy Plaid `category` fallback has no forward-compatibility guard.** `src/lib/plaid.ts:197` (`personal_finance_category?.primary ?? txn.category?.[0] ?? null`) collapses "genuinely uncategorized" and "both source fields gone" into the same `null`.
- `[prior]` **`base64ImageMime` recognizes only PNG/JPEG/GIF/WebP and silently drops the rest.** Any other format Plaid returns (e.g. SVG) makes `GET /api/items/[itemId]/logo` 404 despite valid upstream data; not recorded as a limitation in `item-logo-served-separately.md`.
- `[prior]` **Plaid product/country config validation accepts values the app has no adapter for.** `src/lib/plaid.ts:88-112` validates `PLAID_PRODUCTS`/`PLAID_COUNTRY_CODES` against the full SDK enums rather than the ingest-supported subset (e.g. `liabilities` passes but is silently unused).
- `[prior]` **No declared browser baseline for the client bundle.** `src/lib/http.ts:33` uses `AbortSignal.timeout()` (~mid-2022 browsers) with no `browserslist` or stated minimum, unlike the explicit Node/Postgres floors.
- `[prior]` **No `application_name` on the shared Postgres pool.** `src/lib/pool-config.ts` — SpendRight's sessions are indistinguishable in `pg_stat_activity` on a shared instance.
- `[prior]` **`normalizeAccountName` does no Unicode normalization.** `src/lib/cards.ts:3-5` is `trim().toLowerCase()` only; NFC/NFD variants of a visually identical institution name silently fail the exact match. Narrow edge case within the accepted exact-match design.

## Resolved since prior audit

- **`DATABASE_URL` session-mode requirement** — now explicitly recorded as a dated "Deployment constraint" in `cross-process-sync-lock.md`; resolved-as-documented, no longer an open finding.
