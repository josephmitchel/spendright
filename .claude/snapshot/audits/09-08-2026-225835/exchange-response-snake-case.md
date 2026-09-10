---
characteristics: [maintainability]
level: minor
status: resolved
first-seen: 09-08-2026-223901
locations:
  - src/lib/api-types.ts:75
  - src/lib/api-types.ts:85
  - src/app/api/exchange/route.ts:15
  - src/app/PlaidLinkButton.tsx:35
  - src/app/RepairConnectionButton.tsx:37
---

# ExchangeResponse/LinkTokenResponse break the API contract's camelCase convention

`ExchangeResponse` used snake_case for six of its seven fields even though
none were pass-through Plaid values, breaking the camelCase convention every
other payload/response type in `src/lib/api-types.ts` follows.

**Verified fixed** by all three maintainability auditors: `ExchangeResponse`
is now fully camelCase (`itemId`, `institutionName`, `accountsStored`,
`syncError`, `setupFailed`, `accountErrors`), matching
`src/app/api/exchange/route.ts` and both client call sites (grep for the old
snake_case field names returns nothing). `LinkTokenResponse.link_token`
deliberately remains snake_case with a self-explaining comment — it mirrors
Plaid's own field name verbatim, as the original finding's suggested
direction proposed.
