---
name: postgres-version-floor
description: PostgreSQL 11+ is the documented and startup-checked floor — assertSupportedPostgres refuses an older server at boot instead of failing opaquely on the first sync
tags: [assertSupportedPostgres, server_version_num, src/lib/db.ts, hashtextextended, README.md, .env.example]
date: 2026-09-07
---

Confirmed 2026-09-07: the 2026-09-07 compatibility audit (2 of 4 auditors) found version-sensitive SQL — `hashtextextended` in the sync lock needs PostgreSQL 11+ — with no floor stated anywhere, unlike Node/Plaid/pg which are pinned or `Verified-on`-checked ([[node-version-pinned]], [[verified-claims-checked]]). An older server failed with an opaque `function hashtextextended does not exist` only when the first sync ran. Now `assertSupportedPostgres` (src/lib/db.ts) reads `server_version_num` during instrumentation startup — before the scheduler starts — and throws a plain-language error through the existing fatal-config path ([[config-validated-not-assumed]]'s fail-at-startup principle extended to the server on the other end of `DATABASE_URL`); README and `.env.example` state the floor. The floor is the honest minimum (11), not a currency judgment about what version one *should* run.
