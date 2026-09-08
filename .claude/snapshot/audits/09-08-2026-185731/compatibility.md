---
characteristic: 'compatibility'
---

# Summary

Three auditors examined co-existence (shared machine/DB/ports) and interoperability (Plaid, Postgres, browser). Most compatibility safeguards the snapshot claims were directly verified against installed dependency versions (Plaid-Version pin, advisory-lock namespacing, PG11-compatible migrations, peer-dep ranges). However, this characteristic produced the audit's single Major finding — an empirically confirmed timezone-dependent date-corruption bug at the pg/drizzle boundary — plus a fail-silent gap around pooled Postgres connections and two environment-enforcement nits. All findings are `[new]` (first audit of the era).

# Major Concerns

- `[new]` **Transaction dates silently shift by one day on hosts with a positive UTC offset.** `src/db/schema.ts:108` (string-mode drizzle `date()` column) with no type-parser override in `src/lib/db.ts`/`pool-config.ts`. `pg`'s default parser for the `date` type (OID 1082) returns a JS `Date` constructed in the host's local timezone; drizzle's `mapFromDriverValue` then re-serializes it via `.toISOString()`, so on any UTC-positive host (Europe, Asia, Australia) every transaction date read from the DB rolls back one day. The auditor reproduced it directly: `Asia/Tokyo` and `Europe/Berlin` yield `2024-01-14` for a stored `2024-01-15`; `America/New_York` and `UTC` are correct. Writes are unaffected (Plaid's string passes straight through), making this read-side-only, silent, error-free corruption of displayed dates, sort order, and `GET /api/transactions`. Not blessed anywhere in the snapshot. Suggested fix: `pg.types.setTypeParser(1082, v => v)` to restore the string-in/string-out contract the column already assumes.

# Moderate Concerns

- `[new]` **No detection of an incompatible (transaction-pooling) Postgres connection, despite the app already supporting remote/hosted Postgres.** `src/lib/env.ts` explicitly accommodates non-loopback `DATABASE_URL`s (requiring `sslmode`), anticipating hosted providers that commonly hand out transaction-mode pooled connection strings by default — but `src/lib/sync-lock.ts` (session-scoped `pg_advisory_lock`, session-level `SET`s) and `db.ts`/`pool-config.ts` never verify the connection is session-mode. The snapshot itself states transaction-pooling proxies "silently break" the locking, yet nothing fails fast: a pooled connection would silently defeat per-item mutual exclusion (concurrent syncs could corrupt cursor state) instead of erroring clearly. A cheap probe check is absent.

# Minor Concerns

- `[new]` **Node version contract is declared but not enforced, unlike the analogous Postgres contract.** `package.json` declares `engines: { node: "24.x" }` and `.nvmrc` pins 24, but there is no `.npmrc` with `engine-strict=true` and no runtime assertion — in contrast to `src/lib/db.ts`'s deliberate `assertSupportedPostgres()` startup guard. Dependencies only require Node ≥20.9, so running under the wrong Node major proceeds silently rather than failing loudly. An un-blessed asymmetry in an otherwise "fail loud on environment mismatch" design. (Raised independently by two auditors.)

- `[new]` **`npm run start` has no port-conflict fallback.** `scripts/start.mjs` resolves a single port (default 3000 — the default for a large fraction of Node tooling) and passes it to `next start`, which fails outright without a clear message if the port is bound. `next dev` auto-increments to a free port; the everyday production-mode entry point does not.
