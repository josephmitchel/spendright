---
characteristics: [maintainability]
level: minor
status: resolved
first-seen: 09-08-2026-210043
locations:
  - drizzle/0009_backfill_reward_rate.sql:1
---

# Undocumented legacy backfill query runs on every seed invocation

`scripts/seed-cards.ts` unconditionally ran a legacy `UPDATE transactions … SET reward_rate … WHERE reward_rate IS NULL` backfill on every seed, targeting a state unreachable since migration `0001`, with no explanation of what it guarded.

Verified fixed by all three maintainability auditors: the backfill is gone from `scripts/seed-cards.ts` (grep confirms zero hits) and now lives in the one-time migration `drizzle/0009_backfill_reward_rate.sql`, whose header comment explains the pre-0001 legacy condition it guards, that it's unreachable on post-0001 data, and that it moved from the seed script — exactly the suggested direction (migrations-only convention). The migration file is currently untracked pending commit, which is normal pre-commit state for this repo.
