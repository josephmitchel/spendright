---
name: error-message-allow-list
description: Only Plaid error bodies and app-written PublicErrors reach the client or items.error; everything else is Internal server error
tags: [errorResponse, PublicError, publicErrorMessage, plaidErrorBody, pgErrorCode, src/lib/errors.ts]
date: 2026-09-04
---

Responses are `{ error: { code, message } }`. `err.message` is never echoed by default because drizzle's carries the SQL and bound parameters. A message reaches the user only if it is Plaid's own error body (502) or a `PublicError` the app wrote (its status). Routes that want a specific answer build it themselves (SQLSTATE branches read through `pgErrorCode`). The same allow-list governs what `/api/sync` and `/api/exchange` store on `items.error`.
