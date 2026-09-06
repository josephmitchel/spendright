---
name: error-message-allow-list
description: Only Plaid error bodies and app-written PublicErrors reach the client or items.error; everything else is Internal server error
tags:
  [
    errorResponse,
    jsonError,
    badRequest,
    PublicError,
    publicErrorMessage,
    plaidErrorBody,
    pgErrorCode,
    pickPlaidErrorFields,
    plaidErrorMessage,
    src/lib/errors.ts,
    src/lib/plaid-errors.ts,
    src/lib/public-error.ts,
  ]
date: 2026-09-04
---

Responses are `{ error: { code, message } }`, built only by `jsonError`/`badRequest` in `src/lib/errors.ts` — thrown paths (`errorResponse`) and returned paths (routes, the proxy) alike. `err.message` is never echoed by default because drizzle's carries the SQL and bound parameters. A message reaches the user only if it is Plaid's own error body (502) or a `PublicError` the app wrote (its status). Routes that want a specific answer build it themselves through `jsonError` (SQLSTATE branches read through `pgErrorCode`). The same allow-list governs what `/api/sync` (whose runner the scheduler shares — [[scheduled-sync]]) and `/api/exchange` store on `items.error` (via `recordSyncFailure` in `src/lib/sync.ts`), and it is structural: the five documented Plaid fields (`error_type`, `error_code`, `error_message`, `display_message`, `request_id`) and the `display_message || error_message || fallback` precedence are defined once in the dependency-free `src/lib/plaid-errors.ts`, which `plaidErrorBody`, `loggableError` and the client's item-error rendering all read through — nothing lands on `items.error` (and is served by `GET /api/items`) on the strength of Plaid's response shape alone. The pick type-checks each value at runtime too (2026-09-06): the input is a cast over an unvalidated response body, so a non-string field is dropped rather than stored and rendered as a React child, and `plaidErrorMessage` string-checks before rendering (bodies stored before the check may hold anything). `PublicError` itself lives in the dependency-free `src/lib/public-error.ts` (2026-09-06): the modules that throw it — crypto, plaid, db, categories — take no `next/server` dependency for a plain error class, matching the layering rule `log.ts`/`plaid-errors.ts`/`env.ts` already state.
