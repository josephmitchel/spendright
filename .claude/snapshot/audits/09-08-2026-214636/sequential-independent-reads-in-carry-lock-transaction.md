---
characteristics: [performance-efficiency]
level: minor
status: new
first-seen: 09-08-2026-214636
locations:
  - src/lib/sync-carry.ts:57
  - src/lib/sync.ts:81
---

# Independent reads run sequentially inside the lock-holding sync transaction

In `resolveCarriedSelections` (`src/lib/sync-carry.ts:57-66`), after the
row-locking `SELECT … FOR UPDATE`, the two follow-up lookups —
`liveCategoryIds` over `cardCategories` and over `creditCategories` — are
awaited back-to-back despite having no data dependency; they could run under
`Promise.all` exactly like the already-fixed `listTransactions` pair. The same
shape recurs one level up in `src/lib/sync.ts:81-83`, where
`knownAccountIdsFor(tx, upserts)` and `resolveCarriedSelections(tx, added)` are
also independent reads awaited sequentially.

This matters more than a typical sequential-read nit because the code runs
inside the DB transaction that holds the row locks category PATCHes compete
for (`sync-persist.ts` documents that its duration "must stay bounded by
statement count"), so avoidable round trips extend the window in which a user's
category PATCH can hit lock contention. It is the same root-cause shape as the
resolved `list-transactions-sequential-count` concern, recurring in a more
lock-sensitive path the earlier fix didn't sweep.

Minor because the absolute cost is small (extra local round trips, only when a
sync carries pending→posted rows) and correctness is unaffected. Suggested
direction: wrap the two `liveCategoryIds` calls in `Promise.all` in
`sync-carry.ts`, and consider the same for
`knownAccountIdsFor`/`resolveCarriedSelections` in `sync.ts:81-83` — but note
drizzle transactions execute on a single connection, so verify concurrent
`await`s on `tx` actually interleave (or pipeline) before claiming the win;
if they serialize anyway, the fix is cosmetic and the file should record that.
