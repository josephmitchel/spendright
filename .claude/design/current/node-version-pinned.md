---
name: node-version-pinned
description: The Node major is pinned (engines "24.x" in package.json, .nvmrc) and @types/node tracks it, so the checked type surface matches the executing runtime and a major bump is a deliberate act
tags: [package.json engines, .nvmrc, '@types/node', node 24, scripts/start.mjs]
date: 2026-09-06
---

Confirmed by the user 2026-09-06 (raised by a quality audit): `package.json` pins `engines.node` to `24.x`, `.nvmrc` says `24`, and `@types/node` is `^24` — the audit had found comments verified on Node 20, types pinned `^20`, and the machine running v24, i.e. TypeScript checking one API surface while another executed. The pin is a tripwire, not a guarantee (npm only warns on an engines mismatch without engine-strict); a Node major bump updates engines, .nvmrc, and `@types/node` together.

Updated 2026-09-06: the runtime bind assertion — originally this record's main beneficiary, with its libuv diagnostic-report parsing — is retired ([[runtime-bind-assertion]]). The pin remains as general hygiene for the startup path that still exists (`scripts/start.mjs` resolves Next's CLI entry via `require.resolve`), without any per-minor-version verification burden.
