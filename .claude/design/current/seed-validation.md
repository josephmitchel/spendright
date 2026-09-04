---
name: seed-validation
description: The seed script refuses to run on duplicate or blank matchers and duplicate category names
tags: [scripts/seed-cards.ts, assertUniqueAccountMatchers, assertUniqueCategoryNames, assertUniqueCreditCategoryNames]
date: 2026-09-04
---

Before touching the database the seed fails loudly if a Plaid account name is claimed by two cards or is blank, if a card lists a category name twice (case-insensitive), or if a credit category name repeats. Bad seed data is rejected at the source rather than defended against downstream.
