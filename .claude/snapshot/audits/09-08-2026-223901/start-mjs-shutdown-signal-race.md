---
characteristics: [reliability]
level: moderate
status: new
first-seen: 09-08-2026-223901
locations:
  - scripts/start.mjs:72
  - scripts/start.mjs:79
---

# A shutdown signal during the crash-restart backoff is dropped, orphaning a new server

When the supervised `next start` child crashes, its `exit` handler schedules
`spawnServer()` via a 1-second `setTimeout` (`scripts/start.mjs:72-75`). If
the operator sends SIGINT/SIGTERM during that window — the most likely moment
to reach for Ctrl+C, right after watching the server crash — the signal
handler sets `shuttingDown = true` and calls `child.kill(signal)`, but `child`
still points at the already-exited process, so the kill is a no-op and no
further `exit` event fires. The pending timeout callback never checks
`shuttingDown`: it unconditionally spawns a brand-new server, binds the port,
and runs `warmUp()`, while the parent process never exits. The operator's
shutdown request is silently dropped; a second Ctrl+C is required to actually
stop the freshly spawned child.

Verified by the synthesizer against the current code: the `setTimeout`
callback at line 72 contains no `shuttingDown` check, and the signal handler
at line 79-84 relies entirely on a child `exit` event that cannot fire for an
already-dead process. One of three reliability auditors flagged this; the
supervisor is the piece SNAPSHOT itself calls reliability-critical, and this
is a functional bug in shipped logic, not a deferred-tests gap (SNAPSHOT
defers test coverage for `start.mjs`, not its correctness).

Suggested direction: early-return from the restart `setTimeout` callback when
`shuttingDown` is set, and have the signal handler call `process.exit()`
directly when there is no live child to signal (e.g. `child.exitCode !==
null`), rather than waiting on an exit event that will never come.
