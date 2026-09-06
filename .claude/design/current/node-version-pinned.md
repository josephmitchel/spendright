---
name: node-version-pinned
description: The Node major is pinned (engines "24.x" in package.json, .nvmrc) and @types/node tracks it, because the fail-closed startup infrastructure rests on version-verified Node internals; re-verify and re-date the bind-assertion comments on every major bump
tags:
  [
    package.json engines,
    .nvmrc,
    '@types/node',
    node 24,
    src/lib/bind-assertion.ts,
    scripts/start.mjs,
    diagnostic report,
    process.report,
  ]
date: 2026-09-06
---

Confirmed by the user 2026-09-06 (raised by a quality audit): the startup path — `scripts/start.mjs` and `src/lib/bind-assertion.ts` — is deliberately fail-closed infrastructure built on internals that are only verified per version: the undocumented libuv handle shape in Node's diagnostic report, a deep `require.resolve` into Next's CLI, and the observation that Next listens in the process `register()` runs in. The audit found the drift already present: comments said "verified on Node 20", `@types/node` was pinned `^20`, and the machine ran Node v24.14.1 — TypeScript checking one API surface while another executed, with nothing to flag the gap before a routine `nvm install` armed the tripwire.

Mitigation: `package.json` pins `engines.node` to `24.x` and `.nvmrc` says `24`, `@types/node` is `^24` to match the runtime, and the bind-assertion assumptions were re-verified against Node 24.14.1 (report shape probed empirically; a full production start logged "bind assertion passed") and re-dated in the comments. The pin is a tripwire, not a guarantee (npm only warns on an engines mismatch without engine-strict); the contract is that a Node major bump is a deliberate act that re-verifies and re-dates the comments in `src/lib/bind-assertion.ts` — and updates this record, engines, .nvmrc, and `@types/node` together. Protects the guarantees of [[non-local-request-guard]] and [[scheduled-sync]], whose startup enforcement is exactly what a silent shape change would either break loudly (a refused start) or, worse, quietly.
