---
characteristics: [compatibility]
level: minor
status: resolved
first-seen: 09-08-2026-213020
locations:
  - package.json:29
  - src/lib/pg-error-check.ts:13
  - src/lib/plaid-error-check.ts:47
  - src/lib/pool-config.ts:20
  - src/instrumentation.ts:14
---

# Remaining dependency-shape assumptions lack exact pins or startup canaries

`pgErrorCode`, the Plaid transient-failure/retry-after detection, and the pg
date-parser override rested on `Verified-on:` comments with no startup canary,
and `drizzle-orm`/`pg`/`plaid` were caret-ranged — a lockfile refresh could
silently invalidate every `Verified-on:` claim.

**Verified fixed** by all three compatibility auditors independently (with
reliability and safety auditors corroborating), on both suggested axes:

- **Exact pins**: `package.json` now pins `drizzle-orm` (`0.45.2`), `pg`
  (`8.23.0`), and `plaid` (`41.4.0`) with no carets, matching the existing
  `axios`/`next`/`react` treatment; the lockfile resolves to exactly those
  versions with axios deduped to a single `1.20.0` via `overrides`.
- **Startup canaries**: `assertPgErrorExtraction` (`src/lib/pg-error-check.ts`)
  round-trips a synthetic `DrizzleQueryError` wrapping `{ code: '55P03' }`
  through `pgErrorCode`; `assertPlaidRetryShape`
  (`src/lib/plaid-error-check.ts:47-73`) round-trips real
  `AxiosError`/`AxiosHeaders` instances (a 429 with `retry-after: 7`, a
  non-retryable 400) through `isTransientPlaidFailure`/`retryDelayMs` and
  asserts the 7000ms delay; `assertDateParserPassthrough`
  (`src/lib/pool-config.ts:20-28`) probes the OID-1082 parser. All are wired
  into `src/instrumentation.ts:14-21` and fail closed via `logFatalAndExit`,
  so shape drift now stops the server at startup instead of silently degrading
  the `LOCKED` 503 mapping, the retry policy, or date round-tripping.
