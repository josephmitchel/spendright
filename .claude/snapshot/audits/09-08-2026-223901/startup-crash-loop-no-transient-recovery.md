---
characteristics: [reliability]
level: moderate
status: new
first-seen: 09-08-2026-223901
locations:
  - scripts/start.mjs:59
  - src/instrumentation.ts:27
---

# Crash-loop guard can't distinguish a transiently-unready database from permanent misconfiguration

`start.mjs` restarts the child on unexpected exit with a flat 1s delay and
gives up permanently after 3 exits within 60s (`scripts/start.mjs:59-68`).
`instrumentation.ts` routes *every* startup failure — a genuinely broken
config and a merely not-ready-yet Postgres alike — through the same `catch` →
`logFatalAndExit` → `process.exit(1)` path, and the reachability checks fail
fast on connection-refused. Each failed boot cycle takes roughly 1-4s plus
the 1s delay, so three cycles land well inside the 60s window: a Postgres
instance that takes even 15-30s to come up (a reboot bringing both services
up together, a container booting) exhausts the restart budget and the
supervisor prints "giving up" before the DB would ever become reachable. The
mechanism built specifically for availability converts a transient,
self-resolving fault into a permanent stop requiring a manual `npm start`.

One of three reliability auditors flagged this; the other two read the same
code without raising it, and the flagging auditor itself noted the mitigating
context: it affects only cold start, loses no data, and is unlikely today
where the operator normally has local Postgres already running — but it is a
real gap not covered by any SNAPSHOT deferral, and becomes materially more
relevant under SNAPSHOT's own "database becomes a separate/remote service"
revisit trigger.

Suggested direction: retry the Postgres reachability/version/session-mode
checks with their own bounded backoff (a handful of retries over ~30-60s)
inside `instrumentation.ts` before declaring a fatal failure, reserving the
crash-loop guard for genuinely unrecoverable faults; or add backoff / widen
the window in `start.mjs` so three fast back-to-back failures don't exhaust
the budget within seconds.
