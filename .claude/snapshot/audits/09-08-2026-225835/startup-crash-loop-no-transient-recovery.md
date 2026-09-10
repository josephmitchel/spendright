---
characteristics: [reliability]
level: moderate
status: resolved
first-seen: 09-08-2026-223901
locations:
  - scripts/start.mjs:59
  - src/instrumentation.ts:27
---

# Crash-loop guard can't distinguish a transiently-unready database from permanent misconfiguration

Every startup failure — broken config and not-ready-yet Postgres alike —
routed through the same fail-fast exit path, so three quick boot cycles
against a Postgres still coming up (e.g. after a reboot) exhausted
`start.mjs`'s 3-exits-in-60s crash-loop guard and stopped the server
permanently.

**Verified fixed** by all three reliability auditors: `src/lib/db.ts:48-59`
adds `waitForPostgres()`, which retries connection-class failures
(`ECONNREFUSED`, `ECONNRESET`, `ETIMEDOUT`, `EAI_AGAIN`, `57P03`, and the
pool's connection-timeout message) every 2s for up to 45s — explicitly sized
to stay under the supervisor's 60s warm-up deadline — while non-transient
errors still fail fast. `src/instrumentation.ts:24` awaits it before the
fail-fast Postgres version/session-mode assertions, so a transient cold
start is absorbed inside one boot attempt instead of consuming the
supervisor's restart budget. This implements the original finding's
suggested direction.
