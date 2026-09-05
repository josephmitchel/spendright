---
name: plaid-error-log-redaction
description: raw Plaid/axios errors are never logged — loggableError reduces them to name, axios message, HTTP status and Plaid's error body, because the raw error carries PLAID-SECRET and the decrypted access_token in its config
tags: [loggableError, src/lib/log.ts, errorResponse, console.error, isAxiosError]
date: 2026-09-04
---

The Plaid SDK throws axios errors, and axios hangs the full request config off the error: the `PLAID-SECRET` header and, for token-bearing calls, the decrypted `access_token` in the request body. `console.error` on such an error prints both, defeating [[access-tokens-encrypted]] the first time Plaid returns a routine failure — and one such log site (`src/lib/webhook.ts` key fetch) is reachable by unauthenticated internet callers by design. Every log site a Plaid error can flow through wraps it in `loggableError` (`src/lib/log.ts`, dependency-free so scripts import it too), which keeps only the error name, axios's status-line message, the HTTP status, and Plaid's error body fields (error_type/code/message, display_message, request_id). Non-axios errors pass through unchanged: drizzle detail in server logs stays acceptable ([[error-message-allow-list]]).
