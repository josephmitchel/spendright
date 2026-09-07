---
name: seed-validation
description: The seed script refuses to run on duplicate or blank slugs, duplicate or blank matchers, and duplicate category names
tags:
  [
    scripts/seed-cards.ts,
    assertUniqueKeys,
    assertSeedIsValid,
  ]
date: 2026-09-04
---

Before touching the database the seed fails loudly if a card slug is blank or used twice (case-insensitive — two seeds sharing a slug would otherwise silently merge, the second upsert winning), if a Plaid account name is claimed by two cards or is blank, if a card lists a category name twice (case-insensitive), or if a credit category name repeats. Bad seed data is rejected at the source rather than defended against downstream. The four original per-check asserts were consolidated into one `assertUniqueKeys` helper called from `assertSeedIsValid` (2026-09-06); the checks themselves are unchanged.
