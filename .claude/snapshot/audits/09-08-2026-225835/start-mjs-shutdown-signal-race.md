---
characteristics: [reliability]
level: moderate
status: resolved
first-seen: 09-08-2026-223901
locations:
  - scripts/start.mjs:72
  - scripts/start.mjs:79
---

# A shutdown signal during the crash-restart backoff is dropped, orphaning a new server

When the supervised `next start` child crashed, a SIGINT/SIGTERM arriving
during the 1-second restart backoff was a no-op (`child` pointed at the
already-exited process), and the pending restart timeout unconditionally
spawned a fresh server the operator believed they had stopped.

**Verified fixed** by all three reliability auditors, independently reading
the current `scripts/start.mjs`: the restart `setTimeout` callback
(`scripts/start.mjs:72-78`) now checks `if (shuttingDown) process.exit(1);`
before calling `spawnServer()`, and the signal handler
(`scripts/start.mjs:82-90`) checks `child.exitCode`/`child.signalCode` —
when the child is already dead it exits the parent directly instead of
waiting on an `exit` event that can never fire. Both halves of the race are
closed.
