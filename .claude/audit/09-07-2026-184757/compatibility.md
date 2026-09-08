---
characteristic: "compatibility"
---
# Summary

Four auditors reviewed the codebase against ISO/IEC 25010:2023 §3.3 (co-existence, interoperability). None found a Major concern. All four independently noted the compatibility posture is unusually rigorous: the Postgres version floor is enforced at startup (`assertSupportedPostgres()` in `src/lib/db.ts`, needed because `hashtextextended` requires PG 11+), Node is pinned across `engines`/`.nvmrc`/`@types/node`, the Plaid API version is pinned via an explicit header (`src/lib/plaid.ts:71`) and guarded against drift by `scripts/check-verified-claims.mjs`, Plaid types are adapted into app-owned shapes at ingest, money uses `numeric` columns, and the prior round's two Moderate findings are verified fixed at HEAD (the startup version-floor check, and the key-rotation script's compare-and-swap update that coexists safely with a live server). Accepted boundaries in `deployment-boundaries.md` (shared-instance table collisions, replica scheduler duplication, no tenant scoping) were respected and not re-raised.

Two auditors independently elevated Plaid rate-limit handling to Moderate through the interoperability lens; one raised an advisory-lock namespacing concern.

# Major Concerns

None.

# Moderate Concerns

- **Plaid HTTP 429/`RATE_LIMIT_EXCEEDED` is treated identically to a permanent 4xx failure** (flagged by 3/4 auditors, Moderate for 2) — `isTransientPlaidFailure` (`src/lib/plaid.ts:120-124`) retries only on a missing status or ≥500, so a rate-limit response propagates immediately, is recorded as a hard item failure by `runSyncAll` (`src/lib/sync-all.ts:51-65`), and can surface the connection-repair UI for what is actually the partner product's throttling signal. Recovery only happens at the next hourly scheduler tick, with no backoff. This is known and consciously deferred (`transient-plaid-retry.md` says a backoff scheme "becomes worth revisiting if rate-limit handling is ever added") — surfaced here because it directly misuses information Plaid exchanges about its own state, which is the interoperability lens the deferral record didn't consider.

- **Postgres advisory lock uses a bare 64-bit key with no application-scoped namespace** (1/4) — `src/lib/sync-lock.ts:21` takes `pg_advisory_lock(hashtextextended($1, 0))` in the flat per-database advisory keyspace. The two-argument form exists specifically so cohabiting applications (a job queue, a migration tool) can namespace their locks. Nothing in `cross-process-sync-lock.md` records this as a considered trade-off. Worth deliberately confirming: namespace via the two-int form, or document that the database is guaranteed dedicated.

# Minor Concerns

- **Legacy Plaid `category`/`category_id` fallback has no forward-compatibility guard** (1/4) — `src/lib/plaid.ts:197`: `personal_finance_category?.primary ?? txn.category?.[0] ?? null`. If Plaid removes the deprecated legacy taxonomy while `personal_finance_category` is also absent, ingest silently degrades to `null` with no way to distinguish "genuinely uncategorized" from "both source fields gone."

- **`base64ImageMime` recognizes only 4 raster formats and silently drops the rest** (3/4) — `src/lib/image-mime.ts` sniffs base64 text prefixes for PNG/JPEG/GIF/WebP; anything else (e.g. SVG) makes `GET /api/items/[itemId]/logo` 404 despite valid data from Plaid. Fail-closed is the right choice, but the limitation isn't recorded in `item-logo-served-separately.md` and a format change upstream would silently stop logos rendering.

- **Plaid product/country config validation accepts values the app has no adapter for** (1/4) — `src/lib/plaid.ts:106-112` validates `PLAID_PRODUCTS`/`PLAID_COUNTRY_CODES` against the full SDK enums rather than the subset the ingest layer models; `PLAID_PRODUCTS=liabilities` passes the gate but the data would go unused with no error surfaced.

- **No declared browser baseline for the client bundle** (2/4) — `src/lib/http.ts:33` uses `AbortSignal.timeout()` (requires ~mid-2022 browsers), and there is no `browserslist` or stated minimum anywhere, unlike the explicit Node and Postgres floors. Low impact at the localhost stage; worth a one-line record before the README's "before deploying" work broadens the audience.

- **No `application_name` on the shared Postgres pool** (1/4) — `src/lib/pool-config.ts:19-23`; SpendRight's sessions are indistinguishable in `pg_stat_activity` on a shared instance. A low-cost co-existence courtesy.

- **No runtime check that `DATABASE_URL` is a session-mode connection** (1/4, informational) — a transaction-pooling proxy (PgBouncer transaction mode) would silently defeat the advisory lock. Correctly documented as an accepted boundary in `cross-process-sync-lock.md`.

- **`normalizeAccountName` does no Unicode normalization** (1/4, completeness only) — `src/lib/cards.ts:3-5` is `trim().toLowerCase()` only; NFC/NFD variants of visually identical institution names fail the exact match and silently leave an account unmatched. A narrow edge case within the accepted exact-match design (`account-card-matching-by-name.md`).
