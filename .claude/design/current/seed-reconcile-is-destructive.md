---
name: seed-reconcile-is-destructive
description: Running the seed reconciles the catalog to the file, removing cards and categories no longer listed, but must not touch categorized transactions
tags: [scripts/seed-cards.ts, card_categories, credit_categories, cards, onDelete set null]
date: 2026-09-04
---

The seed reconciles rather than appends: cards, card categories and credit categories absent from the seed file are removed from what can be picked. That reconcile is scoped to the catalog. Existing transactions keep the category and rate they were categorized with ([[categorization-is-a-historical-snapshot]]).

Known gap (2026-09-04): today the reconcile hard-deletes category and card rows and the `on delete set null` FKs strip the category from old transactions. Flag until the reconcile no longer mutates transaction history.
