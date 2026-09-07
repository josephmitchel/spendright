---
characteristic: "compatibility"
---
# Summary

Five auditors reviewed co-existence and interoperability (primarily Plaid and PostgreSQL). None found a Major concern. The codebase is unusually disciplined about environment-coupled assumptions: pinned Node version, `Verified-on:` dependency-drift markers enforced by `scripts/check-verified-claims.mjs`, a pinned Plaid API version, and the recently added `Provider*` type abstraction (`src/lib/provider-types.ts`) that decouples internal code and stored payloads from Plaid SDK shape changes — a pattern worth preserving for any future provider integration.

The recurring themes: the Plaid API-version pin has no drift guard (unlike every other cross-dependency assumption in the repo), tables live unprefixed in the `public` schema, the in-process concurrency guards don't protect against a second OS process sharing the same database, and one genuine data-loss gap — `unofficial_currency_code` is dropped entirely at ingest.

# Major Concerns

None found by any of the five auditors.

# Moderate Concerns

- **`unofficial_currency_code` is dropped entirely** — `src/lib/plaid.ts:146-176` (`toProviderAccount`/`toProviderTransaction`), `src/lib/provider-types.ts:14,26`, `src/db/schema.ts:89,113`. Plaid's `iso_currency_code` and `unofficial_currency_code` are mutually exclusive (one is always populated; non-ISO/crypto currencies use the latter). The adapters read only `iso_currency_code`; there is no column or field for the other. For accounts the loss is permanent (no raw-payload column); for transactions the raw JSON retains it but is never served, so API consumers see `isoCurrencyCode: null` with no recovery. Not recorded anywhere as a deliberate trade-off.

- **Plaid API-version pin has no drift guard** (flagged by 4 of 5) — `src/lib/plaid.ts:70` hardcodes `'Plaid-Version': '2020-09-14'` with no test or `Verified-on:` marker tying it to the installed `plaid@41.4.0` SDK. It currently matches the SDK's own default, but nothing catches it going stale after a future SDK bump — inconsistent with how every other environment coupling in this repo is tracked.

- **In-process concurrency guards don't cover multi-process co-existence** — `src/lib/sync.ts:34-40`, `src/lib/sync-scheduler.ts:12-16`, `src/lib/global-singleton.ts:1-11`. `serializeByKey`/`singleFlight`/the scheduler flag live on `globalThis`; nothing (advisory lock, lockfile) prevents two processes of the same app pointed at the same `DATABASE_URL` (e.g. `next dev` + `npm start`) from racing the `items.cursor` write the guards exist for. `scheduled-sync.md` reasons through bundler module duplication but not true multi-process execution.

- **No database-schema namespacing** — `src/db/schema.ts` creates unprefixed tables in the default `public` schema; `.env.example:1` suggests a dedicated database by convention only. Silent collision risk if `DATABASE_URL` ever points at a shared Postgres.

- **Card-to-account matching is a brittle string contract** — `src/lib/cards.ts:4-8` matches on exact (case-insensitive) Plaid account `name`, which Plaid does not guarantee stable; an issuer rename silently reclassifies an account as unsupported with no fallback key (mask, institution ID) and no alert. Documented as a deliberate early-stage simplification, but a single point of interoperability failure to track.

- **Inline first-sync exceeds common host request-timeout ceilings** — `src/app/api/exchange/route.ts:8-22` runs multiple Plaid calls plus a full initial sync (with up to ~6s of NOT_READY sleeps) in one request; incompatible with serverless-style timeouts (e.g. Vercel's 10s hobby limit, self-flagged in `README.md:105-123`). Real constraint on future deploy targets.

- **Hardcoded PNG MIME for institution logo** — `src/app/page.tsx:80` builds a `data:image/png;base64` URI for the logo Plaid returns (`src/lib/plaid.ts:183-197`); Plaid doesn't contractually guarantee PNG, a mismatch fails silently, and nothing validates the format on ingest or records the assumption.

# Minor Concerns

- **No stated minimum PostgreSQL version** despite reliance on `jsonb`, row locking, and check constraints; low risk (features are old and broadly supported).
- **No explicit connection-pool ceiling or statement timeout** — `src/lib/db.ts:22-26` takes `pg` driver defaults; not coordinated with other consumers of a shared Postgres (also raised under Performance/Reliability).
- **Default dev port 3000** — common local collision source; the bind error isn't translated into a clear "in use" message (`scripts/start.mjs:23,42`); `PORT`/`-p` overrides exist.
- **`engines.node: "24.x"` is advisory only** — no `.npmrc` `engine-strict`, no runtime check; the repo's "config-validated-not-assumed" principle isn't applied to the Node runtime itself (partially recorded in `node-version-pinned.md`).
- **Manual push→migrate baselining is procedurally mitigated only** — `README.md:39-86`; a wrong `__drizzle_migrations.created_at` baseline silently skips migration 0003's sign constraint; no automated assertion guards it.
- **Amounts rendered without currency** — `TransactionTable.tsx:133` renders `txn.amount` bare and never uses `isoCurrencyCode` in the UI; narrower instance of the currency-metadata theme above.
- **Raw payload column typed against the current SDK shape** — `src/db/schema.ts:125`; older stored rows may not match the type after upgrades (low risk; debug-only, never served).

# Handoff

- `scripts/tighten-next.mjs:14` unconditionally shells out to Unix `chmod` with no `process.platform` check — a portability issue passed to the Flexibility report.
