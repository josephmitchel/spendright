---
name: promise-discipline-linted
description: Type-aware linting is on (projectService), with no-floating-promises and no-misused-promises as errors and react-hooks/exhaustive-deps upgraded to error, so the void-prefix convention and hook-dependency contracts are checked rather than habitual
tags:
  [
    eslint.config.mjs,
    projectService,
    no-floating-promises,
    no-misused-promises,
    react-hooks/exhaustive-deps,
  ]
date: 2026-09-06
---

Confirmed 2026-09-06 (quality audit): the codebase's correctness rides on promise discipline — the deliberate `void`-prefix fire-and-forget convention, `serializeByKey`/`singleFlight` ordering, async handlers behind void-returning props — and none of it was checked. `eslint.config.mjs` now enables type-aware linting (`projectService`, scoped to `.ts`/`.tsx`) with `@typescript-eslint/no-floating-promises` and `no-misused-promises` as errors, and upgrades `react-hooks/exhaustive-deps` from the preset's warn to error (`npm run lint` exits 0 on warnings — the same reasoning already recorded for `no-unused-vars`). Same enforced-not-habitual upgrade as [[client-server-boundary-enforced]] and [[verified-claims-checked]].

One contract lint still cannot fully check — `useLoadProtocol`'s memoized-`perform` requirement — is documented at the hook, not runtime-enforced: the development-mode guard that briefly policed it was deleted the same day (2026-09-06, [[load-protocol-simplified]]); `react-hooks/exhaustive-deps` as an error is the lint-side backstop.
