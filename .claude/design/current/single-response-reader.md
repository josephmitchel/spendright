---
name: single-response-reader
description: Every client read of an API response goes through getJson/sendJson in src/lib/http.ts (both read via the module-private readJson), typed with the route's response type
tags: [getJson, sendJson, readJson, src/lib/http.ts, src/lib/api-types.ts, src/app/page.tsx, PlaidLinkButton, src/app/accounts/[accountId]]
date: 2026-09-04
---

`getJson`/`sendJson` are the two request shapes components use; both read through `readJson<T>`, which parses the body first — an error response's message lives in that body — then throws on a non-ok status with the API's error message or a caller-phrased fallback, and treats a null or unparseable body as unreadable. `readJson` is module-private (unexported 2026-09-06, raised by a quality audit: it had no external callers, and exporting it would invite a hand-rolled fetch around the shared request shapes). Callers pass the route's response type from `src/lib/api-types.ts` ([[typed-api-contract]]) so the body is typed at the boundary. It only works as a rule if it is the only way bodies are read; a component parsing a response by hand is a violation.
