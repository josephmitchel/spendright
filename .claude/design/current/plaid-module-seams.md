---
name: plaid-module-seams
description: src/lib/plaid.ts deliberately stays one module for now; when it outgrows ~400 lines or gains another operation family, it splits along the recorded seams (config/client, retry, adapters, operations)
tags: [src/lib/plaid.ts, getClient, retryOnce, toProviderItem, getEnvEnumList]
date: 2026-09-07
---

Confirmed 2026-09-07: the 2026-09-07 maintainability audit flagged `src/lib/plaid.ts` (302 lines, the repo's largest file) as a multi-responsibility module growing with no documented split boundary. The user chose recording the seams over splitting now — the file works, and churn without need contradicts [[modules-named-for-contents]]'s purpose. The intended seams, for whoever splits it later: **config/client** (`getBasePath`, `getCredential`, `getEnvEnumList`, `getClient` — the env-validated construction), **retry** (`isTransientPlaidFailure`, `retryOnce`, sleep — see [[transient-plaid-retry]]), **adapters** (`toProviderItem`/`toProviderAccount`/`toProviderTransaction` — the [[plaid-types-adapted-at-ingest]] boundary), and **operations** (the exported Plaid calls). Split trigger: the file passing ~400 lines, or a new family of operations (e.g. webhooks, investments) landing in it. Until then, additions should keep those four regions distinct within the file.

Update 2026-09-07 (user-confirmed, after the 2026-09-07 audit re-flagged the trigger as unenforced while the file grew 303 → 321): the 400-line trigger is now mechanical — `max-lines` (400, blank lines and comments counted) is an ESLint error across `src/**` and `scripts/**` in `eslint.config.mjs`, so this file (or any other) passing the trigger fails `npm run lint` instead of relying on a future audit to notice. The general guardrail doubles as the repo-wide file-growth check earlier audits asked for.
