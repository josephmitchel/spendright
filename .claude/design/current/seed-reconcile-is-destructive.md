---
name: seed-reconcile-is-destructive
description: Running the seed reconciles the catalog to the file, retiring cards and categories no longer listed; its only transaction write is a null-rate backfill
tags: [scripts/seed-cards.ts, card_categories, credit_categories, cards, retired_at]
date: 2026-09-04
---

The seed reconciles rather than appends: cards, card categories and credit categories absent from the seed file are removed from what can be picked. "Removed" means retired, not deleted ([[categories-retired-not-deleted]]). The reconcile transaction writes only the catalog tables and the accounts re-match — no statement in it touches `transactions`. The one statement in the script that does touch `transactions` sits outside that transaction: a backfill that fills only null `reward_rate`s and never overwrites one ([[categorization-is-a-historical-snapshot]]). Existing transactions keep the category and rate they were categorized with.

Resolved 2026-09-04: the hard-delete reconcile, whose FK cascades stripped categories from old transactions, is gone.
