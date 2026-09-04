---
name: card-catalog-in-code
description: Cards and their categories are defined in a seed file and reconciled into Postgres by a script; there is no UI for editing them
tags: [src/db/cards.seed.ts, scripts/seed-cards.ts, npm run seed:cards, cards, card_categories, credit_categories]
date: 2026-09-04
---

The card catalog is `src/db/cards.seed.ts`, applied with `npm run seed:cards`. `slug` is a card's stable identity: changing anything else updates the card, changing the slug creates a new one. Removing a slug or a category name retires the row rather than deleting it, and adding it back revives the same row ([[categories-retired-not-deleted]]). Credit (inflow) categories are a global list in the same file. No UI or API writes cards or categories. See [[seed-reconcile-is-destructive]] and [[seed-validation]].
