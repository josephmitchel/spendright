---
name: typed-api-contract
description: Each route's payload is declared once in src/lib/api-types.ts and checked on both sides — handlers annotate NextResponse.json<SomePayload>, clients read the Serialized response via readJson; no hand-declared row mirrors
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
    NextResponse.json,
    AccountsPayload,
    ExchangeResponse,
    LinkResult,
    SyncAllResult,
  ]
date: 2026-09-06
---

Every route's response shape is declared once in `src/lib/api-types.ts` and enforced on both sides of the wire. Producer-side enforcement added 2026-09-06 after a quality audit found the routes unchecked: deriving from `$inferSelect` caught schema column renames, but a route-level envelope change (renaming `total`, or a drifted key in the exchange route's hand-mapped body) compiled clean and broke the UI at runtime — exactly the failure this record exists to prevent. The mechanism: each route has a `*Payload` type — the object its handler actually constructs, with `Date` columns still `Date` — derived from the schema's row types (the transaction shape reuses `CategorizedTransaction` from src/lib/categories.ts rather than re-declaring it), and the client-facing `*Response` type is that payload mapped through the recursive `Serialized<T>` (Date → ISO string, as JSON actually delivers; numeric columns are already strings). Handlers annotate `NextResponse.json<SomePayload>(...)`, so a drifted object literal fails excess-property checking; clients read bodies as `readJson<SomeResponse>(...)` ([[single-response-reader]]) and must never hand-declare their own partial row interfaces. Payloads with no timestamp columns use one type for both sides: `SyncResponse` wraps `SyncAllResult` from src/lib/sync-all.ts instead of restating its union, and `ExchangeResponse`'s snake_case fields are indexed off `LinkResult` (`item_id: LinkResult['itemId']`, …), so a rename on either side of that mapping breaks compilation. The types are asserted at the boundary, not runtime-validated: the server is this same app. Column omissions are derived, never restated (2026-09-06, after a quality audit showed the earlier `Omit<>` pairs failing open — adding a secret column to the type-level omit but not the runtime pick compiled clean and served the column): the served row types (`PublicItemRow` in src/lib/items.ts, `CategorizedTransaction` in src/lib/categories.ts) are `Pick`s over `keyof` the runtime column pick, so the exclusion is made exactly once, in the pick. Jsonb columns declare their stored shape with `.$type<...>()` (confirmed 2026-09-06): `items.error` is `ItemErrorBody` (`PlaidErrorFields | { message: string }`, defined in src/lib/plaid-errors.ts), so its two writers in src/lib/sync.ts and the client's item-error rendering share one compiler-checked union instead of a hand-declared cast; `plaid_transaction` is the SDK's `Transaction`, and the product lists are `string[]`. A bare `jsonb(...)` (→ `unknown`) is the hole that forces clients back into hand-declared mirrors. Works with [[client-pages-fetch-api]].
