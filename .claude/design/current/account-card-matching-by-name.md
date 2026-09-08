---
name: account-card-matching-by-name
description: An account resolves to a card by case-insensitive exact match on its Plaid account name and nothing else; the match is recomputed on every sync and seed run, an unmatched account is unsupported (no table, no pickers, PATCH refused) but nothing about it is erased, and accounts never move between cards
tags:
  [
    matchCard,
    src/lib/cards.ts,
    cards.plaid_account_names,
    accounts.card_id,
    upsertAccount,
    src/lib/accounts.ts,
    scripts/seed-cards.ts,
    syncItem carry,
    transactions.card_category_id,
    src/app/accounts/[accountId]/page.tsx,
    PATCH /api/transactions/[transactionId],
    Card not supported,
  ]
date: 2026-09-04
---

`matchCard` is the single definition of how a Plaid account maps to a card: trim, lowercase, exact match against `cards.plaid_account_names`. There is no manual assignment, no fuzzy match, and no match by institution or mask. An account whose name is not listed is unsupported (see the supported-account rule below).

## Rematch on every sync (decided 2026-09-04)

`upsertAccount` re-runs `matchCard` and writes the result over `accounts.card_id` unconditionally. A Plaid rename that no longer matches drops the account to unsupported on the next sync, not only on re-link. There is deliberately no "keep the existing card_id" branch; do not add one. Nothing is destroyed by the demotion (see below).

## Supported-account rule (decided 2026-09-04)

Every account SpendRight works with is matched to a card. An unmatched account renders "Card not supported" with its identity and balances only: no transaction table, no pickers. The PATCH endpoint refuses to set a card category or a credit category on such an account. Enforcement is the render layer plus PATCH — this is a UI-and-write rule, not an API-read rule: `GET /api/transactions` still serves the rows (the page fetches them before it knows whether the account is matched), and that is fine because nothing renders them. There is no such thing as categorizing a transaction on an account with no card; do not write code for that case.

## Unmatched is temporary (decided 2026-09-04)

A Plaid account rename can drop the match until the seed file lists the new name. During that window the account is unsupported (above) but nothing about it is wrong: no writer may clear or drop a saved category or rate because `card_id` is currently null, and everything reappears once the match comes back.

An account never legitimately starts matching a _different_ card. The user would not move an Amex Blue account's history onto an Amex Gold. There is therefore no "card move" case to handle, and no writer clears card-category links on the strength of a card mismatch. Consistent with [[categorization-is-a-historical-snapshot]]: old transactions are never rewritten because the card side changed.

Resolved 2026-09-04: the card-move wipe is gone from `upsertAccount`, the seed reconcile and the pending-to-posted carry. `upsertAccount` now writes the accounts row and nothing else; the seed's per-account loop only re-matches; the carry consults neither the account's card nor the category's. See [[card-move-wipe]] in retired.
