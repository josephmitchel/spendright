---
name: typed-api-contract
description: Each route's payload is declared once in src/lib/api-types.ts and checked on both sides — handlers annotate NextResponse.json<SomePayload>, clients read the Serialized response via getJson/sendJson (the only response readers, both through the module-private readJson); no hand-declared row mirrors
tags:
  [
    readJson,
    getJson,
    sendJson,
    src/lib/http.ts,
    src/lib/api-types.ts,
    ApiAccount,
    servedAccountColumns,
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
    src/app/page.tsx,
    PlaidLinkButton,
    src/app/accounts/[accountId],
  ]
date: 2026-09-04
---

Every route's response shape is declared once in `src/lib/api-types.ts` and enforced on both sides of the wire. Producer-side enforcement added 2026-09-06 after a quality audit found the routes unchecked: deriving from `$inferSelect` caught schema column renames, but a route-level envelope change (renaming `total`, or a drifted key in the exchange route's hand-mapped body) compiled clean and broke the UI at runtime — exactly the failure this record exists to prevent. The mechanism: each route has a `*Payload` type — the object its handler actually constructs, with `Date` columns still `Date` — derived from the schema's row types (the transaction shape reuses `CategorizedTransaction` from src/lib/transactions.ts rather than re-declaring it), and the client-facing `*Response` type is that payload mapped through the recursive `Serialized<T>` (Date → ISO string, as JSON actually delivers; numeric columns are already strings). Handlers annotate `NextResponse.json<SomePayload>(...)`, so a drifted object literal fails excess-property checking; clients read bodies as `readJson<SomeResponse>(...)` (below) and must never hand-declare their own partial row interfaces. Payloads with no timestamp columns use one type for both sides: `SyncResponse` wraps `SyncAllResult` from src/lib/sync-all.ts instead of restating its union, and `ExchangeResponse`'s snake_case fields are indexed off `LinkResult` (`item_id: LinkResult['itemId']`, …), so a rename on either side of that mapping breaks compilation. The types are asserted at the boundary, not runtime-validated: the server is this same app. Column omissions are derived, never restated (2026-09-06, after a quality audit showed the earlier `Omit<>` pairs failing open — adding a secret column to the type-level omit but not the runtime pick compiled clean and served the column): the served row types (`PublicItemRow` in src/lib/items.ts, `CategorizedTransaction` in src/lib/transactions.ts, and since 2026-09-07 `ServedAccountRow` over `servedAccountColumns` in src/lib/accounts.ts — currently excluding nothing, so that adding an accounts column is an explicit served-API decision rather than silently reaching the browser) are `Pick`s over `keyof` the runtime column pick, so the exclusion is made exactly once, in the pick. Jsonb columns declare their stored shape with `.$type<...>()` (confirmed 2026-09-06): `items.error` is `ItemErrorBody` (`PlaidErrorFields | { message: string }`, defined in src/lib/plaid-errors.ts), so its two writers in src/lib/sync-outcome.ts and the client's item-error rendering share one compiler-checked union instead of a hand-declared cast; `plaid_transaction` is the SDK's `Transaction`, and the product lists are `string[]`. A bare `jsonb(...)` (→ `unknown`) is the hole that forces clients back into hand-declared mirrors. Works with [[client-pages-fetch-api]].

## Single response reader (decided 2026-09-04)

Every client read of an API response goes through `getJson`/`sendJson` in `src/lib/http.ts` — the two request shapes components use; both read through `readJson<T>`, which parses the body first — an error response's message lives in that body — then throws on a non-ok status with the API's error message or a caller-phrased fallback, and treats a null or unparseable body as unreadable. `readJson` is module-private (unexported 2026-09-06, raised by a quality audit: it had no external callers, and exporting it would invite a hand-rolled fetch around the shared request shapes). Callers pass the route's response type from `src/lib/api-types.ts` so the body is typed at the boundary. It only works as a rule if it is the only way bodies are read; a component parsing a response by hand is a violation.
