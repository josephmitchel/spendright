---
characteristic: 'compatibility'
---

# Summary

Four independent auditors reviewed the codebase against ISO/IEC 25010:2023 §3.3 (co-existence, interoperability). The consensus verdict: compatibility is treated unusually seriously for this stage — a namespaced cross-process Postgres advisory lock (`spendright:item-sync:${itemId}`), single-flight sync guards, deterministic port resolution in `scripts/start.mjs`, `.next` cache permission tightening, the `check-verified-claims.mjs` lint gate against dependency drift, and a pinned `Plaid-Version` header verified consistent with the installed `plaid@41.4.0` SDK. **No auditor found a major issue.** The strongest cross-auditor finding is the silent loss of Plaid's `unofficial_currency_code` at ingest (2 of 4 auditors, both moderate).

# Major Concerns

None.

# Moderate Concerns

- **`unofficial_currency_code` silently dropped at Plaid ingest** (`src/lib/plaid.ts:148-178` `toProviderAccount`/`toProviderTransaction`, `src/lib/provider-types.ts`, `src/db/schema.ts` `isoCurrencyCode` columns) — flagged by 2 auditors. Plaid guarantees exactly one of `iso_currency_code`/`unofficial_currency_code` is non-null; the adapters read only the ISO field, so non-ISO-denominated accounts get `isoCurrencyCode: null` and the UI renders amounts with no currency label and no indication data was dropped. Unrecoverable for accounts (no raw-payload column); transactions retain it in raw JSON but never surface it. No design record covers currency handling — this is not an accepted scope limitation.
- **`scripts/tighten-next.mjs` shells out to Unix-only `chmod` with no platform guard** — invoked from `predev`/`prebuild`/`postbuild`/`start.mjs`; on Windows (outside WSL/Git Bash) every `npm run dev|build|start` aborts with a raw `ENOENT` spawn failure before Next even runs, with no fallback and no clear "Windows isn't supported" message (and no `os` field in `package.json`).
- **Advisory-lock semantics assume a direct/session-mode Postgres connection** (`src/lib/sync-lock.ts`) — `SET lock_timeout` + `pg_advisory_lock` on a checked-out client depends on session-level state and session-end release. Behind a transaction-pooling proxy (PgBouncer transaction mode, common Neon/Supabase pairings for the README's anticipated Vercel deployment), the cross-process sync lock (`cross-process-sync-lock.md`) could silently stop providing mutual exclusion. Nothing in code or docs pins the "no transaction pooler" requirement.
- **Card-to-account matching is a brittle string contract with Plaid** (`src/lib/cards.ts:8-18` `matchCard`/`normalizeAccountName`) — flagged by 2 auditors (one moderate, one minor). Exact trim+lowercase match on the institution-supplied Plaid account `name`; an institution-side rename silently reclassifies the account as unsupported (`cardId` null) with no fallback key (mask, institution id) and no surfaced mismatch report. The name-matching approach itself is a documented decision (`account-card-matching-by-name`); the un-reported silent degradation is the residual.
- **Inline first-sync exceeds common host request-timeout ceilings** (`src/app/api/exchange/route.ts:8-24`) — `linkItem` plus a full initial `transactionsSync` drain (up to ~20s of `NOT_READY` sleeps, `plaid.ts:211-220`, `256-266`) runs synchronously inside one HTTP request. Self-flagged in `README.md:121` (Vercel hobby 10s limit) but with no structural mitigation (background job, reduced retry budget).
- **Pinned Plaid API version has no drift guard** (`src/lib/plaid.ts:70`, `'Plaid-Version': '2020-09-14'`) — one auditor flagged that `check-verified-claims.mjs` can't validate an API-version header literal the way it validates `Verified-on:` package comments, so a future `plaid` SDK bump could silently drift the pin. Two other auditors verified the pin is currently correct for `plaid@41.4.0`; the concern is only about future drift detection.
- **No database-schema namespacing** (`src/db/schema.ts`) — all tables live unprefixed in the default `public` schema; pointing `DATABASE_URL` at a shared Postgres instance risks table-name collisions with no structural guard (dedicated database is convention-only via `.env.example`).
- **Hardcoded PNG MIME type for Plaid institution logos** (`src/app/page.tsx:83`, `src/lib/plaid.ts:185-199`) — Plaid doesn't contractually guarantee the logo is PNG; a format mismatch renders a broken image with no validation at ingest and no recorded assumption.

# Minor Concerns

- **No handling of Plaid rate-limit responses** — `RATE_LIMIT_EXCEEDED`/429 is not distinguished from other errors in the sync path; it aborts the item's sync and is retried without backoff on the next hourly tick. Low risk single-item; matters once several items plus manual syncs can overlap the scheduler.
- **Legacy `category`/`category_id` fallback has no forward-compat guard** (`src/lib/plaid.ts:173`) — deliberate per `plaid-category-reserved`, but Plaid has deprecated the legacy fields; if they're removed while `personal_finance_category` is also absent, ingest degrades to `null` silently.
- **No stated minimum PostgreSQL version** — flagged by 2 auditors. The schema and lock code have real version floors (`hashtextextended` requires PG ≥ 11, plus `jsonb`, check constraints), yet unlike Node/Plaid/pg couplings this contract isn't tracked anywhere.
- **No pool ceiling/statement timeout coordinated with other DB consumers** (`src/lib/db.ts:22-26`) — `pg` defaults; nothing caps SpendRight's footprint if the Postgres instance is ever shared.
- **Dev port conflicts surface as raw `EADDRINUSE`** (`scripts/start.mjs:23,42`) — no friendly "port in use" message from the wrapper; `PORT`/`-p` overrides exist.
- **`engines.node: "24.x"` is advisory only** (`package.json:6`) — no `engine-strict`, no runtime assertion, unlike the repo's other validated environment assumptions.
