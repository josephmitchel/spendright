---
name: typed-api-contract
description: Client code reads API responses as types derived from the schema's row types in src/lib/api-types.ts; no hand-declared row mirrors
tags:
  [
    readJson,
    src/lib/api-types.ts,
    ApiAccount,
    ApiItem,
    ApiCard,
    ApiTransaction,
    Serialized,
    src/db/schema.ts,
    ItemErrorBody,
    $type,
  ]
date: 2026-09-06
---

Every route's response shape is declared once in `src/lib/api-types.ts`, derived from the schema's `$inferSelect` row types (with `Serialized<T>` mapping timestamp columns to the ISO strings JSON actually delivers, and route-level omissions like `accessToken` and `plaidTransaction` encoded as `Omit`s). Client components read bodies as `readJson<SomeResponse>(...)` ([[single-response-reader]]) and must never hand-declare their own partial row interfaces — that is what previously let a schema column rename compile clean and break the UI at runtime. The types are asserted at the boundary, not runtime-validated: the server is this same app. Jsonb columns declare their stored shape with `.$type<...>()` (confirmed 2026-09-06): `items.error` is `ItemErrorBody` (`PlaidErrorFields | { message: string }`, defined in src/lib/plaid-errors.ts), so its two writers in src/lib/sync.ts and the client's item-error rendering share one compiler-checked union instead of a hand-declared cast; `plaid_transaction` is the SDK's `Transaction`, and the product lists are `string[]`. A bare `jsonb(...)` (→ `unknown`) is the hole that forces clients back into hand-declared mirrors. Works with [[client-pages-fetch-api]].
