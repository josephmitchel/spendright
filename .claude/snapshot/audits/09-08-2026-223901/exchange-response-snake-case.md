---
characteristics: [maintainability]
level: minor
status: new
first-seen: 09-08-2026-223901
locations:
  - src/lib/api-types.ts:75
  - src/lib/api-types.ts:85
  - src/app/api/exchange/route.ts:15
  - src/app/PlaidLinkButton.tsx:35
  - src/app/RepairConnectionButton.tsx:37
---

# ExchangeResponse/LinkTokenResponse break the API contract's camelCase convention

Every other payload/response type in `src/lib/api-types.ts` is camelCase,
matching the DB schema and the typed-contract convention SNAPSHOT documents
as first-class. `ExchangeResponse` alone uses snake_case for six of its seven
fields (`item_id`, `institution_name`, `accounts_stored`, `sync_error`,
`setup_failed`, `account_errors`) even though none are pass-through Plaid
fields — they're constructed in `src/app/api/exchange/route.ts` from the
already-camelCase `LinkResult`. `LinkTokenResponse.link_token` is more
defensible (it round-trips Plaid's own field name verbatim) but reads as part
of the same inconsistent cluster, and nothing explains the exception.

Why it matters: this is the only divergence in an otherwise-universal naming
style in the typed contract. TypeScript keeps both sides in lockstep so
there's no defect today, but it undermines analysability — a maintainer must
remember this one endpoint is an exception, and the inconsistency invites a
future edit to either "helpfully" normalize it (breaking consumers) or copy
the snake_case habit into a new payload by mistaken precedent.

Suggested direction: rename `ExchangeResponse`'s constructed fields to
camelCase, updating `src/app/api/exchange/route.ts` and the two consumers.
If `link_token`/`public_token` stay snake_case as a deliberate mirror of
Plaid's own vocabulary, a one-line note at their declaration keeps that
exception self-explaining.
