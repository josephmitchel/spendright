---
characteristics: [maintainability]
level: minor
status: new
first-seen: 09-08-2026-225835
locations:
  - src/lib/redaction-check.ts:6
  - src/lib/plaid-error-check.ts:7
  - src/lib/pg-error-check.ts:6
  - src/lib/pool-config.ts:17
  - src/instrumentation.ts:12
---

# Startup dependency-shape canary convention is not documented in SNAPSHOT

The codebase has a real, consistent, four-file architectural pattern:
whenever code duck-types a pinned third-party dependency's internal
error/data shape (axios error config for redaction, axios/Plaid error body
shape, drizzle's `DrizzleQueryError.cause` SQLSTATE extraction, pg's date
type-parser registry), a synthetic round-trip "canary" check runs at startup
via `instrumentation.ts`, so a dependency bump that silently changes the
shape fails loudly (`logFatalAndExit`) instead of silently degrading a
security or correctness guarantee (secret redaction, the `LOCKED`/409 error
mappings, retry policy, date handling).

SNAPSHOT documents individual instances piecemeal (the Postgres version
floor "asserted at startup", the config-validation bullet) but never names
this as a generalized, load-bearing convention — verified by grep: SNAPSHOT
contains no mention of the canary/self-check pattern, the `*-check.ts`
files, or the redaction self-test. Anyone adding a fifth duck-typed
assumption about a pinned dependency's internals has no documented signal
that this pattern exists or where its instances live. Same class of gap as
the now-fixed `caller-contract-snapshot-gap`: a real, must-be-extended
convention living only in scattered code, not in the authoritative map.

Suggested direction: at the next `/snapshot`, add one Architecture bullet
naming the convention (duck-typed assumption about a pinned dependency →
startup canary wired into `instrumentation.ts`) and pointing at its
instances.
