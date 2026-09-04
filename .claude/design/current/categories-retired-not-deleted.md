---
name: categories-retired-not-deleted
description: Cards, card categories and credit categories that leave the seed file are stamped retired_at, never deleted; retired rows are not offered but every existing link to them holds
tags: [cards.retired_at, card_categories.retired_at, credit_categories.retired_at, scripts/seed-cards.ts, matchCard, GET /api/cards, PATCH /api/transactions/[transactionId], drizzle/0006_fast_spyke.sql]
date: 2026-09-04
---

The seed reconcile sets `retired_at = now()` on any card, card category or credit category absent from `cards.seed.ts`, and clears it again if the slug or name comes back. Nothing in the catalog is ever deleted, so the `on delete set null` FKs on `transactions` never fire and a categorized transaction keeps both its category link and its rate whatever happens to the card's terms ([[categorization-is-a-historical-snapshot]]).

Retired rows are excluded from what can be picked, in three places: `matchCard` skips retired cards, so an account on one drops to unsupported; `GET /api/cards` omits retired cards and categories, so the pickers never list them; `PATCH` refuses a retired category with a 400. `GET /api/transactions` still resolves names by join, so a retired category renders by name on the account page, as the disabled selected option in the picker.

Chosen over snapshotting the category name onto the transaction row because it is the smaller change and keeps the FK honest. Replaces the hard-delete reconcile described in [[seed-reconcile-is-destructive]].
