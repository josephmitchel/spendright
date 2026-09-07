---
characteristic: "compatibility"
---
# Summary

No major issues. Auditors noted the codebase is unusually disciplined about compatibility process: `Verified-on: <pkg>@<version>` comments checked automatically by `scripts/check-verified-claims.mjs` in `npm run lint`, Node pinned across `package.json`/`.nvmrc`/`@types/node`, and the deliberately minimal interoperability surface (loopback-only, no webhook) recorded as confirmed design decisions. One auditor verified the pinned `Plaid-Version: 2020-09-14` header matches the installed SDK's own default, softening (but not eliminating) another auditor's version-drift concern. Financial amounts are kept as strings end-to-end (Postgres `numeric` → JSON), avoiding float-fidelity bugs.

# Major Concerns

None found by any auditor.

# Moderate Concerns

- **Plaid SDK lag and the unrecorded API-version pin** (1 auditor; partially rebutted by another) — `package.json` pins `plaid@^41.4.0` (latest 47.x) and `react-plaid-link@^4.2.0` (latest 5.x), and `src/lib/plaid.ts:64` hardcodes `Plaid-Version: 2020-09-14` with no design record tying the pairing together. A second auditor confirmed the header is identical to the installed SDK's default, so there is no drift *today* — but nothing (lint rule, `Verified-on` comment, or design record) would flag the header as stale after a future SDK bump past a breaking change. Given how carefully every other environment-coupled assumption is recorded, this one stands out as untracked.
- **No database-schema namespacing** (1 auditor) — `src/db/schema.ts` creates `accounts`, `items`, `transactions`, `cards`, etc. in the default `public` schema with no app prefix; `.env.example` only suggests a dedicated `spendright` database by convention. Pointing `DATABASE_URL` at a shared database risks migration failures or silent collision with another tool's identically named tables (co-existence risk).
- **Card-to-account matching is a brittle, unversioned contract with Plaid data** (1 auditor) — `matchCard` (`src/lib/cards.ts`) resolves accounts purely by exact case-insensitive string match on Plaid's account `name` (per `account-card-matching-by-name.md`). Plaid doesn't guarantee name stability; issuer renames silently reclassify a supported account as unsupported with no fallback (institution ID, mask, product type) and no alerting. A deliberate early-stage simplification, but a single point of failure worth tracking.
- **Sync-on-exchange can exceed common host request-timeout ceilings** (1 auditor) — `POST /api/exchange` runs several Plaid calls plus the initial sync (with up to ~6s of `NOT_READY` sleeps) inline in one request, which is incompatible with serverless-style request timeouts. Already self-documented in `README.md` ("Before deploying…"); surfaced here as a live co-existence risk for any future deployment target.

# Minor Concerns

- **No stated minimum PostgreSQL version** (1 auditor) — the schema relies on Postgres-specific features (`jsonb`, `FOR UPDATE`/`FOR SHARE`, check constraints) yet no doc states a supported Postgres version — an asymmetry with the otherwise version-pinned environment. Practical risk low (features are old and widespread).
- **No explicit resource ceiling on the connection pool** (1 auditor) — `src/lib/db.ts:19` takes pg defaults (max 10, no idle timeout); no deliberate limit on what the app claims from a Postgres instance if it's ever shared.
- **Default port 3000 collision** (1 auditor) — standard Next.js default alongside other dev servers; mitigated by the Host-checking proxy guard, noted as a co-existence footgun only.
- **Stored raw Plaid payload type can drift across SDK upgrades** (1 auditor) — `src/db/schema.ts:125` types the `jsonb` column as the *current* SDK's `Transaction` shape while historical rows keep older shapes. Low risk (debug-only, never served per `raw-plaid-payload-stored-not-served.md`); worth a one-line acknowledgment.
- **Manual push→migrate baselining remains an error-prone process step** (1 auditor) — the README-documented reconciliation between a `drizzle-kit push`-provisioned DB and the migration ledger requires hand-copying an epoch timestamp; mitigated by documentation, not code.

# Out-of-scope handoff

One auditor noted `scripts/tighten-next.mjs:14` shells out unconditionally to Unix `chmod` with no `process.platform` check (hard fail on native Windows) — classified under Flexibility→Adaptability, not Compatibility; recorded here so it doesn't fall between audits.
