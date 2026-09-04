---
name: seed-reconcile-is-destructive
description: Running the seed reconciles the catalog to the file, retiring cards and categories no longer listed, and never touches categorized transactions
tags: [scripts/seed-cards.ts, card_categories, credit_categories, cards, retired_at]
date: 2026-09-04
---

The seed reconciles rather than appends: cards, card categories and credit categories absent from the seed file are removed from what can be picked. "Removed" means retired, not deleted ([[categories-retired-not-deleted]]); the reconcile writes only the catalog tables and the accounts re-match, and no statement in it touches `transactions`. Existing transactions keep the category and rate they were categorized with ([[categorization-is-a-historical-snapshot]]).

Resolved 2026-09-04: the hard-delete reconcile, whose FK cascades stripped categories from old transactions, is gone.
