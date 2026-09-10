---
characteristics: [maintainability]
level: minor
status: new
first-seen: 09-08-2026-210043
locations:
  - scripts/seed-cards.ts:252
---

# Undocumented legacy backfill query runs on every seed invocation

`main()` unconditionally runs `UPDATE transactions t SET reward_rate = cc.rate FROM card_categories cc WHERE t.card_category_id = cc.id AND t.reward_rate IS NULL` on every `npm run seed:cards`. The only nearby comment explains placement (outside the reconcile transaction to avoid deadlocking with a sync), not purpose. Multiple independent auditors traced every write path that sets `cardCategoryId` (`setTransactionCategory` in `src/lib/categories.ts`, the carry logic in `src/lib/sync-carry.ts`, `conflictSetForKind` in `src/lib/sync-persist.ts`) and confirmed `cardCategoryId` and `rewardRate` are always written together — the state this backfill targets is unreachable today, dating from before migration `0001` established the pairing. It also uses the category's seed-time rate rather than pick-time, so if the condition ever did arise it would conflict with the "rate captured at pick time" invariant. It isn't mentioned in SNAPSHOT.md's description of `seed:cards`, so a future maintainer can't tell whether it's still needed or safe to delete. Suggested direction: fold it into a one-time migration (consistent with the "migrations only, no push" convention) and drop it from the seed script, or add a one-line note explaining what legacy condition it guards and why it stays.
