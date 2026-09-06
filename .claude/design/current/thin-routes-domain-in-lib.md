---
name: thin-routes-domain-in-lib
description: Domain operations live in src/lib behind named functions; API routes are thin wrappers that parse HTTP and map errors
tags:
  [
    src/lib/categories.ts,
    setTransactionCategory,
    src/lib/link.ts,
    linkItem,
    src/lib/sync.ts,
    src/lib/sync-all.ts,
    errorResponse,
    PublicError,
  ]
date: 2026-09-06
---

Every domain operation lives in `src/lib/` behind a named function; a route handler only parses the request, calls it, and maps errors to responses. Confirmed 2026-09-06 after a quality audit found the two hardest flows — the category PATCH and the link-onboarding workflow — living inside their route files, untestable without constructing a `Request`; they moved to `src/lib/categories.ts` and `src/lib/link.ts`. Rejections decided inside domain code are `PublicError` (never a response object), so the rules stay free of `next/server` and one error convention serves the whole app ([[category-write-contract]]).
