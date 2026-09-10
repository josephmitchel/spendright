---
characteristics: [compatibility]
level: minor
status: new
first-seen: 09-08-2026-213020
locations:
  - package.json:30
  - src/lib/pg-errors.ts:6
  - src/lib/plaid.ts:130
  - src/lib/pool-config.ts:11
---

# Remaining dependency-shape assumptions lack exact pins or startup canaries

The fix that resolved `plaid-error-shape-no-runtime-guard` established the codebase's pattern for this risk class: a duck-typed extraction of a third-party library's shape that drives documented app behavior gets a startup canary, not just a `Verified-on:` comment. Two auditors independently found the same underlying gap persisting elsewhere:

- `pgErrorCode` (`src/lib/pg-errors.ts:6-14`) walks `err.cause` looking for a SQLSTATE code based on "Verified-on: drizzle-orm@0.45.2". It is the sole interpreter behind two documented behaviors — 55P03/40P01 → `LOCKED` 503 app-wide, and 23503 → 409 on the category PATCH. If a drizzle/pg bump changes how the driver error attaches, it silently returns `undefined` and both mappings degrade to generic 500s.
- `isTransientPlaidFailure`/`retryDelayMs` (`src/lib/plaid.ts:130-145`) duck-type `err.isAxiosError`, `err.response.status`, and the lower-cased `retry-after` header. Shape drift silently turns the documented one-bounded-retry policy into "no retry, ever".
- The pg date-column type-parser override (`src/lib/pool-config.ts:11-15`), which governs whether transaction dates round-trip without a day shift, rests on the same comment-only verification.
- Compounding this, `drizzle-orm`, `pg`, and `plaid` are declared with caret ranges (`package.json:30,32-33`) unlike the exact-pinned `axios` (enforced via `overrides`) and `next`/`react` — a lockfile refresh can silently pull a version that invalidates every `Verified-on:` claim. The lockfile currently resolves to exactly the verified versions, so the risk is latent, capping severity at minor.

Suggested direction: exact-pin `drizzle-orm`, `pg`, and `plaid` the way `axios` is pinned, and/or extend the existing canary pattern — synthetic-input round-trips asserted at startup in `src/instrumentation.ts` — to cover `pgErrorCode` (a synthetic `{ cause: { code: '55P03' } }` error), `isTransientPlaidFailure`/`retryDelayMs` (a synthetic 429 `AxiosError` with a `retry-after` header), and the pg date parser.
