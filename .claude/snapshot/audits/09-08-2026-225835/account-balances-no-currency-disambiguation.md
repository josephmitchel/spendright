---
characteristics: [safety]
level: minor
status: new
first-seen: 09-08-2026-225835
locations:
  - src/app/accounts/[accountId]/page.tsx:42
  - src/lib/money.ts:16
---

# Account-detail balances (the pre-spending page) render with no currency disambiguation

`formatMoney` uses `currencyDisplay: 'narrowSymbol'`, which collapses
CAD/AUD/NZD/SGD/HKD/MXN to the same bare `$` as USD in an en-US runtime.
Every other money-rendering surface pairs each amount with an explicit
Currency column (home page accounts table, transaction table), but
`AccountIdentity` (`src/app/accounts/[accountId]/page.tsx:42-61`) computes
`rowCurrency(account)` solely to feed `formatMoney` and never prints the
code as visible text — on precisely the page SNAPSHOT calls "the one a user
checks before spending." SNAPSHOT puts money rendering in scope ("data
correctness, not styling") and claims the currency code "always comes from
the row, never an assumed default" — a claim this call site doesn't uphold
at the presentation layer.

Latent today (default `PLAID_COUNTRY_CODES=US`, single US card), but not
structurally prevented since `PLAID_COUNTRY_CODES` is operator-configurable
(ISO 25010 hazard warning / risk identification).

Suggested direction: render the currency code alongside the balances in
`AccountIdentity` (matching the other two surfaces), or switch to
`currencyDisplay: 'symbol'` (e.g. `CA$1,234.56`) so Intl disambiguates for
every current and future call site.
