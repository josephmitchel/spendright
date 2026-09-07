---
name: non-local-request-guard
description: The loopback bind (-H 127.0.0.1 on both dev and start, appended last-wins by scripts/start.mjs so it cannot be overridden) is the enforcement; src/proxy.ts is defense-in-depth — a uniform 404 for requests not addressed to a loopback host, no path exempt, and a 403 for state-changing requests whose Origin is not same-origin with the request; frame-ancestors 'none' refuses embedding; nothing may forward traffic to this app; production mode is the everyday mode because next dev's /__nextjs_* endpoints sit ahead of the guard
tags:
  [
    src/proxy.ts,
    proxy,
    src/instrumentation.ts,
    scripts/start.mjs,
    package.json dev script,
    package.json start script,
    next.config.ts headers,
    Host,
    x-forwarded-host,
    x-forwarded-for,
    Origin,
    frame-ancestors,
    DNS rebinding,
  ]
date: 2026-09-04
---

The 2026-09-04 security audit found the unauthenticated app reachable beyond the local browser two ways: the webhook tunnel (`ngrok http 3000` forwards the whole origin, not just `/api/webhook`) and the server's default `0.0.0.0` bind. Confirmed fix: the bind is the enforcement, and `src/proxy.ts` (Next 16's renamed middleware) is defense-in-depth on top of it. Since 2026-09-05 the tunnel itself is retired ([[scheduled-sync]]) and the app has no internet-reachable path at all.

- **The bind is what actually keeps the LAN out**: both `dev` and `start` run with `-H 127.0.0.1` (`start` through `scripts/start.mjs`, which appends it _after_ any user args so commander's last-wins semantics make it unoverridable, 2026-09-06), so nothing off-host can open a socket at all. It must be unconditional, not dev-only, because the header checks below are forgeable on a direct TCP connection — Next fills `x-forwarded-*` with `??=` (only when absent), so a client-sent `Host: localhost` plus `X-Forwarded-For: 127.0.0.1` passes them, as the follow-up audit verified empirically against the running server.
- **The runtime bind assertion is retired** (2026-09-06, user decision — see the retired [[runtime-bind-assertion]] record for what it did and why it went): the `-H` flag lives only in the npm scripts, so a bare `next dev`/`next start` binds every interface with nothing to catch it — an accepted trade; do not re-flag it. The flag itself is made unoverridable where the scripts are used: `scripts/start.mjs` appends `-H 127.0.0.1` after any user args (the Next CLI's last-wins semantics), parses every port form the CLI accepts so its startup warm-up request aims at the real port, and stops the server if no response arrives within 60s — `next start` runs instrumentation lazily on the first request, and the warm-up is what starts the sync scheduler at boot rather than at first traffic.
- **No tunnel or forwarder of any kind is supported** (2026-09-05, superseding the 2026-09-04 "HTTP tunnels only" rule): with the webhook retired, nothing legitimate forwards traffic here. A raw TCP forward (`ssh -R`, socat, editor port forwarding) connects from loopback and hands the remote caller every header — indistinguishable in code from the local browser. The forwarded-header checks below remain as defense-in-depth should anything ever forward traffic anyway.
- Every path answers a uniform bodyless 404 unless the request is loopback end-to-end: Host is a loopback name (`localhost`, `127.0.0.1`, `[::1]`), `x-forwarded-host` (if any) is loopback, and every entry in the `x-forwarded-for` chain is a loopback IP. This layer holds only against callers that cannot forge cleanly — DNS rebinding (the browser sends the rebound Host) and forwarding tunnels/proxies that append the caller's real address to `x-forwarded-for` — which is exactly its job. It is not a substitute for the bind. 404, not 403: a scanner learns nothing. A Host containing `/`, `\`, `@`, `?`, `#` or whitespace is refused before URL parsing (2026-09-05): `new URL()` would read `evil.com@localhost` or `localhost/evil` as a loopback hostname. No exploit existed (such a caller could as easily send `Host: localhost`, and the `x-forwarded-for` chain still names them), so this is parser hardening only. The unbracketed `::1` was dropped from the loopback set as dead code — `URL.hostname` only ever yields the bracketed form.
- `next.config.ts` caps buffered request bodies at 128KB (`proxyClientMaxBodySize`): the proxy's presence makes Next buffer every body up front (10MB default), and nothing the app accepts is more than a few KB. (Recorded here since 2026-09-05; previously under the retired webhook-jwt-verification record.)
- CSRF: non-GET/HEAD/OPTIONS requests carrying an Origin get 403 unless it is same-origin with the request itself (http, exact host and port from the Host header) — browsers attach Origin to every cross-origin request, including preflight-free simple POSTs; Origin-less requests (curl) pass. Merely-local is not enough (2026-09-04 audit): any other locally-running site, e.g. a dev server on another port, is a different origin and must not be able to drive the API.
- Clickjacking (2026-09-04 audit): `next.config.ts` sends `Content-Security-Policy: frame-ancestors 'none'` (plus `X-Frame-Options: DENY`) on every path — a page iframing `http://localhost:3000` would produce same-origin clicks the Origin check cannot see.

- **Residual, dev mode only (2026-09-05 audits): `next dev`'s `/__nextjs_*` endpoints bypass the proxy, and DNS rebinding reaches them with no forwarder.** The dev bundler serves them before route resolution, so the proxy structurally cannot intercept them, and Next's own `blockCrossSiteDEV` checks Origin/Sec-Fetch but never Host — under DNS rebinding the attacker's page is same-origin with `http://<rebound-host>:3000`, its plain GET carries no Origin, and the victim's own browser connects from loopback, so retiring the tunnel did _not_ close this path. Reachable surface includes `/__nextjs_launch-editor` (opens any absolute path in the editor) and `/__nextjs_attach-nodejs-inspector` (the process holding ENCRYPTION_KEY and decrypted Plaid tokens). Not fixable in this repo. Confirmed mitigation (2026-09-05): **production mode is the everyday mode** — `npm run build && npm run start` (`next start` does not mount these endpoints); treat `next dev` as short-lived, attended development work. The proxy's Host check defeats rebinding for every _routed_ path — every SpendRight route stays protected in either mode.

This is a guard for the tunnel and the LAN, not authentication — [[single-user-localhost-no-auth]] still blocks real deployment.
