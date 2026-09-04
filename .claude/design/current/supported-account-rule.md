---
name: supported-account-rule
description: An account with no matched card is unsupported; it shows no transactions and accepts no categorization of either kind
tags: [src/app/accounts/[accountId]/page.tsx, PATCH /api/transactions/[transactionId], accounts.card_id, Card not supported]
date: 2026-09-04
---

Every account SpendRight works with is matched to a card. An unmatched account renders "Card not supported" with its identity and balances only: no transaction table, no pickers. The PATCH endpoint refuses to set a card category or a credit category on such an account. There is no such thing as categorizing a transaction on an account with no card; do not write code for that case. Companion rule: [[unmatched-is-temporary]].
