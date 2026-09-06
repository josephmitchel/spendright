---
name: single-response-reader
description: Every client read of an API response goes through readJson in src/lib/http.ts, typed with the route's response type
tags: [readJson, joinedFailureMessage, src/lib/http.ts, src/lib/api-types.ts, HomeClient, PlaidLinkButton, src/app/accounts/[accountId]]
date: 2026-09-04
---

`readJson<T>` parses the body first — an error response's message lives in that body — then throws on a non-ok status with the API's error message or a caller-phrased fallback, and treats a null or unparseable body as unreadable. Callers pass the route's response type from `src/lib/api-types.ts` ([[typed-api-contract]]) so the body is typed at the boundary. It only works as a rule if it is the only way bodies are read; a component parsing a response by hand is a violation.
