---
name: account-card-matching-by-name
description: An account resolves to a card by case-insensitive exact match on its Plaid account name, and nothing else
tags: [matchCard, src/lib/cards.ts, cards.plaid_account_names, accounts.card_id]
date: 2026-09-04
---

`matchCard` is the single definition of how a Plaid account maps to a card: trim, lowercase, exact match against `cards.plaid_account_names`. There is no manual assignment, no fuzzy match, and no match by institution or mask. An account whose name is not listed is unsupported (see [[supported-account-rule]]).
