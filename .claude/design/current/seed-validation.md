---
name: seed-validation
description: The seed script refuses to run on duplicate or blank slugs, duplicate or blank matchers, duplicate category names, and implausible reward rates (must be finite, > 0, ≤ 20)
tags:
  [
    scripts/seed-cards.ts,
    assertUniqueKeys,
    assertSeedIsValid,
    MAX_PLAUSIBLE_RATE,
  ]
date: 2026-09-04
---

Before touching the database the seed fails loudly if a card slug is blank or used twice (case-insensitive — two seeds sharing a slug would otherwise silently merge, the second upsert winning), if a Plaid account name is claimed by two cards or is blank, if a card lists a category name twice (case-insensitive), or if a credit category name repeats. Bad seed data is rejected at the source rather than defended against downstream. The four original per-check asserts were consolidated into one `assertUniqueKeys` helper called from `assertSeedIsValid` (2026-09-06); the checks themselves are unchanged.

Added 2026-09-07 (confirmed by the user after the 2026-09-07 audit — all four safety auditors and three functional-suitability auditors flagged it): every category `rate` must be finite, greater than 0, and at most `MAX_PLAUSIBLE_RATE` (20). The seed file is the sole editorial authority on rates ([[card-catalog-in-code]]) with no downstream guard, so a transposition typo (`60` for `6`) previously shipped straight to the UI and into per-transaction `reward_rate` snapshots as authoritative guidance. No real card pays more than ~10% cashback or ~10x points; 20 leaves promo headroom while catching order-of-magnitude typos. Distinct from [[reward-caps-deferred]], which defers cap/tier *modeling* — this checks the plausibility of the flat number itself.
