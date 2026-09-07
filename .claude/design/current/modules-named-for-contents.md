---
name: modules-named-for-contents
description: Modules and directories are named for what they hold — the kind→key mapping lives in category-kinds.ts, its server descriptors in category-kind-sources.ts, and shared hooks in src/hooks/ rather than src/components/
tags:
  [
    src/lib/category-kinds.ts,
    src/lib/category-kind-sources.ts,
    src/hooks/useLoadProtocol.ts,
    src/hooks/useAsyncAction.ts,
    src/hooks/useVisiblePoll.ts,
    src/components/ErrorNotice.tsx,
    src/lib/async-coordination.ts,
    src/lib/pg-errors.ts,
    src/lib/request-body.ts,
  ]
date: 2026-09-06
---

Confirmed 2026-09-06 after a quality audit found names misleading searchers: the kind→key mapping (`categoryKindKeys`, `CategoryKind`, the sign rule) lived in `amounts.ts` while a file named `category-kinds.ts` held only the server-side descriptors, and `src/components/` held three shared hooks beside one actual component. Renames: `amounts.ts` → `category-kinds.ts` (the dependency-free, client-bundleable core — imported by server code too, so no `.client` suffix, which would misdescribe it), the old `category-kinds.ts` → `category-kind-sources.ts` (named for its export), and the shared hooks moved to `src/hooks/` (`ErrorNotice` stays in `src/components/`). The two-module split itself is unchanged — see [[category-kind-sign-rule]] and [[client-server-boundary-enforced]]. Page-local hooks keep living beside their pages.

Extended 2026-09-07 (user-confirmed after a quality audit): `serialize.ts` → `async-coordination.ts` (it holds `serializeByKey`/`singleFlight`, execution serialization — while `Serialized<T>` in api-types.ts means JSON wire serialization, so one word carried two unrelated meanings in src/lib/); and `errors.ts` shed its two non-error concerns — the SQLSTATE walker `pgErrorCode` to `src/lib/pg-errors.ts` (dependency-free, mirroring plaid-errors.ts, so domain code can branch on a code without next/server) and `readJsonBody` to `src/lib/request-body.ts`.
