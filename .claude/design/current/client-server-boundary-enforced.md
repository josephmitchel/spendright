---
name: client-server-boundary-enforced
description: The client/server boundary is build-enforced — the server graph's roots (db, plaid, crypto) import 'server-only', so a value import from client code fails the build transitively; consistent-type-imports (lint error) keeps type-only imports spelled as such
tags:
  [
    server-only,
    src/lib/db.ts,
    src/lib/plaid.ts,
    src/lib/crypto.ts,
    '@typescript-eslint/consistent-type-imports',
    eslint.config.mjs,
    CategoryKind,
    src/lib/category-kinds.ts,
    src/lib/api-types.ts,
    import type,
  ]
date: 2026-09-06
---

Client code may only reach the server module graph (`db`, the Plaid SDK, `crypto`) through `import type`. Two mechanisms enforce it (strengthened 2026-09-06, user-confirmed, after a quality audit found the earlier lint-only claim overstated — `consistent-type-imports` only governs how a type-only import is spelled and would not stop a new value import of the pool):

- **Build-time (the real gate):** `src/lib/db.ts`, `src/lib/plaid.ts`, and `src/lib/crypto.ts` each `import 'server-only'`, which Next handles natively — a client-component graph that value-imports any of them (directly or through a module that does) fails the build with a named error. Poisoning the three roots covers the rest of the server graph transitively, since a server module that touches nothing secret-bearing has nothing to leak; a genuinely new independent server root must add its own `import 'server-only'`. The `server-only` npm package is installed only so tsc resolves the import; Next ignores its contents. The seed script and drizzle.config stay outside Next and deliberately import none of the three roots (they open their own pool via `env.ts`).
- **Lint:** `@typescript-eslint/consistent-type-imports` as an error keeps an import used only in type position spelled `import type`, so `src/lib/api-types.ts` and the client hooks stay erasable.

Where a type is small and shared, it still lives in a dependency-free module instead of being type-imported out of the server graph at all: `CategoryKind` sits in `src/lib/category-kinds.ts`, joining `sync-messages.ts`, `plaid-errors.ts`, `provider-types.ts`, `public-error.ts`, `log.ts`, `http.ts`, `async-coordination.ts`, `pg-errors.ts`, `request-body.ts` (next/server types only), `api-paths.ts`, `pagination.ts`, `account-display.ts`, `sync-failure.ts`.
