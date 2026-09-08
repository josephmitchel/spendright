---
name: runtime-bind-assertion
description: RETIRED 2026-09-06 — the runtime loopback-bind assertion (src/lib/bind-assertion.ts, scheduled from instrumentation.ts, reading process.report's libuv handles) was removed; the -H 127.0.0.1 bind, the start.mjs wrapper, and the proxy guard remain
tags: [src/lib/bind-assertion.ts, process.report, libuv, node diagnostic report, Verified-on node]
date: 2026-09-06
---

Removed on the user's decision 2026-09-06, following a quality audit that judged the mechanism's recurring maintenance cost out of proportion to what it guarded: ~160 lines parsing the undocumented shape of Node's diagnostic report (`process.report.getReport().libuv`), fail-closed on any shape drift, to double-check a single CLI flag — plus a `Verified-on: node@X.Y` lint rule that made `npm run lint` fail on every routine Node minor release.

What it did: at 3s and 15s after `register()`, read this process's listening TCP sockets from the diagnostic report, kill the server on a wildcard bind, and probe every non-loopback interface as a second layer. What was removed with it: the file, its scheduling block in `src/instrumentation.ts`, and the `node@` branch of `scripts/check-verified-claims.mjs` (package markers remain, see [[design-consistency-checks]]).

What still enforces localhost-only ([[non-local-request-guard]]): `-H 127.0.0.1` on both `dev` and `start` (appended last in `scripts/start.mjs`, so it cannot be overridden), and `src/proxy.ts`'s uniform 404 for any request not loopback end-to-end. The accepted risk: a bare `next dev`/`next start` run outside the npm scripts binds every interface with nothing to catch it — do not flag this in audits; it is a deliberate trade.
