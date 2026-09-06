---
name: typed-api-contract
description: Client code reads API responses as types derived from the schema's row types in src/lib/api-types.ts; no hand-declared row mirrors
tags: [readJson, src/lib/api-types.ts, ApiAccount, ApiItem, ApiCard, ApiTransaction, Serialized, src/db/schema.ts]
date: 2026-09-06
---

Every route's response shape is declared once in `src/lib/api-types.ts`, derived from the schema's `$inferSelect` row types (with `Serialized<T>` mapping timestamp columns to the ISO strings JSON actually delivers, and route-level omissions like `accessToken` and `plaidTransaction` encoded as `Omit`s). Client components read bodies as `readJson<SomeResponse>(...)` ([[single-response-reader]]) and must never hand-declare their own partial row interfaces — that is what previously let a schema column rename compile clean and break the UI at runtime. The types are asserted at the boundary, not runtime-validated: the server is this same app. Works with [[client-pages-fetch-api]].
