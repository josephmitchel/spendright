---
characteristic: 'compatibility'
---

# Summary

The compatibility posture is materially better than at the prior audit. Both substantive prior findings were verified as fixed by all three auditors (commit `fbf2912`): the Major timezone date-shift bug is resolved by `types.setTypeParser(1082, (value) => value)` in `src/lib/pool-config.ts` (the sole `new Pool` construction site, so all consumers inherit it; traced through drizzle's `mapFromDriverValue` to confirm strings now pass through untouched), and the Moderate silent transaction-pooling incompatibility is resolved by the new `assertSessionModeConnection()` in `src/lib/db.ts`, wired into startup via `src/instrumentation.ts` and failing loudly. Fresh sweeps of the Plaid SDK seam, advisory-lock namespacing (`LOCK_CLASS_ID = 'SPR1'`), migrations (all PG11-compatible), peer-dependency ranges, `Verified-on:` markers (all match installed versions — no stale claims), `sslmode` enforcement, currency-format fallback for non-ISO codes, and cross-platform handling found nothing new. `tsc --noEmit` is clean. Two prior Minor concerns remain open.

# Major Concerns

None. (The prior Major — timezone-dependent transaction-date corruption — is resolved and verified by all three auditors.)

# Moderate Concerns

None. (The prior Moderate — no detection of an incompatible transaction-pooling Postgres connection — is resolved and verified by all three auditors.)

# Minor Concerns

- `[prior]` **Node version contract declared but not enforced** (`package.json`). `engines: { node: "24.x" }` and `.nvmrc` exist, but there is no `.npmrc` with `engine-strict=true` and no runtime assertion analogous to `assertSupportedPostgres()` — `next`'s own engines floor is only `>=20.9.0`, so running under a mismatched Node major proceeds silently. An asymmetry against the project's otherwise fail-loud-on-environment-mismatch convention.

- `[prior]` **`npm run start` has no port-conflict fallback** (`scripts/start.mjs`). It resolves exactly one port (default 3000) and passes it straight to `next start` with no `EADDRINUSE` detection or auto-increment (`next dev` auto-increments; the production entry point doesn't). One auditor noted the crash-loop guard now retries a bound-port failure a few times before a generic "exited 3 times" message rather than identifying the conflict — not a regression, but slightly worse UX than a clean immediate failure.
