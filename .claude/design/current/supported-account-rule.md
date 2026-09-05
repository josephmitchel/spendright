---
name: supported-account-rule
description: An account with no matched card is unsupported; the account page withholds its transaction table and pickers, and PATCH refuses categorization of either kind
tags: [src/app/accounts/[accountId]/page.tsx, PATCH /api/transactions/[transactionId], accounts.card_id, Card not supported]
date: 2026-09-04
---

Every account SpendRight works with is matched to a card. An unmatched account renders "Card not supported" with its identity and balances only: no transaction table, no pickers. The PATCH endpoint refuses to set a card category or a credit category on such an account. Enforcement is the render layer plus PATCH — this is a UI-and-write rule, not an API-read rule: `GET /api/transactions` still serves the rows (the page fetches them before it knows whether the account is matched), and that is fine because nothing renders them. There is no such thing as categorizing a transaction on an account with no card; do not write code for that case. Companion rule: [[unmatched-is-temporary]].
