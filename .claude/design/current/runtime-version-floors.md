---
name: runtime-version-floors
description: Runtime version floors are pinned and checked — the Node major via engines "24.x"/.nvmrc/@types/node kept in lockstep, and PostgreSQL 11+ via assertSupportedPostgres refusing an older server at boot instead of failing opaquely on the first sync
tags:
  [
    package.json engines,
    .nvmrc,
    '@types/node',
    node 24,
    scripts/start.mjs,
    assertSupportedPostgres,
    server_version_num,
    src/lib/db.ts,
    README.md,
    .env.example,
  ]
date: 2026-09-06
---

## Node version pinned (confirmed 2026-09-06)

`package.json` pins `engines.node` to `24.x`, `.nvmrc` says `24`, and `@types/node` is `^24` — the quality audit that raised this had found comments verified on Node 20, types pinned `^20`, and the machine running v24, i.e. TypeScript checking one API surface while another executed. The pin is a tripwire, not a guarantee (npm only warns on an engines mismatch without engine-strict); a Node major bump updates engines, .nvmrc, and `@types/node` together.

Updated 2026-09-06: the runtime bind assertion — originally this rule's main beneficiary, with its libuv diagnostic-report parsing — is retired ([[runtime-bind-assertion]]). The pin remains as general hygiene for the startup path that still exists (`scripts/start.mjs` resolves Next's CLI entry via `require.resolve`), without any per-minor-version verification burden.

## Postgres version floor (confirmed 2026-09-07)

The 2026-09-07 compatibility audit (2 of 4 auditors) found version-sensitive SQL — `hashtextextended` in the sync lock needed PostgreSQL 11+ — with no floor stated anywhere, unlike Node/Plaid/pg which are pinned or `Verified-on`-checked ([[design-consistency-checks]]). An older server failed with an opaque `function hashtextextended does not exist` only when the first sync ran. Now `assertSupportedPostgres` (src/lib/db.ts) reads `server_version_num` during instrumentation startup — before the scheduler starts — and throws a plain-language error through the existing fatal-config path ([[config-validated-not-assumed]]'s fail-at-startup principle extended to the server on the other end of `DATABASE_URL`); README and `.env.example` state the floor. The floor is the honest minimum (11), not a currency judgment about what version one *should* run.

Update 2026-09-07: the sync lock moved to the two-int `pg_advisory_lock(int, hashtext(...))` form ([[cross-process-sync-lock]]), so `hashtextextended` — the original motivator for the 11+ floor — is no longer used. The floor and its startup check are retained as the supported baseline the app is verified against; nothing currently pins the minimum higher.
