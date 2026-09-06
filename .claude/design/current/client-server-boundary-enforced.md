---
name: client-server-boundary-enforced
description: Type-only imports across the client/server boundary are lint-enforced (consistent-type-imports as an error), and types clients need at runtime-adjacent positions live in dependency-free modules, not the server graph
tags:
  [
    '@typescript-eslint/consistent-type-imports',
    eslint.config.mjs,
    CategoryKind,
    src/lib/amounts.ts,
    src/lib/public-error.ts,
    src/lib/plaid-errors.ts,
    src/lib/sync-messages.ts,
    src/lib/api-types.ts,
    import type,
  ]
date: 2026-09-06
---

Client code may only reach the server module graph (`db`, the Plaid SDK, `crypto`) through `import type`, and that rule is enforced by lint, not comments: `@typescript-eslint/consistent-type-imports` runs as an error (2026-09-06, after a quality audit found the boundary held only by hand-written warnings — one accidental value import would have dragged the Postgres pool and Plaid SDK into the browser bundle). `src/lib/api-types.ts` stays type-only under the same rule. Where a type is small and shared, it lives in a dependency-free module instead of being type-imported out of the server graph at all: `CategoryKind` sits with the sign rule in `src/lib/amounts.ts` (not in the db-backed `categories.ts`), joining the existing dependency-free set (`amounts.ts`, `sync-messages.ts`, `plaid-errors.ts`, `public-error.ts`, `log.ts`, `http.ts`, `serialize.ts`).
