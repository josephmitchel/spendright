---
characteristics: [performance-efficiency]
level: minor
status: resolved
first-seen: 09-08-2026-214636
locations:
  - src/lib/sync-carry.ts:57
  - src/lib/sync.ts:82
---

# Independent reads run sequentially inside the lock-holding sync transaction

In `resolveCarriedSelections`, the two `liveCategoryIds` lookups (card and
credit categories) were awaited back-to-back despite having no data
dependency, and one level up `knownAccountIdsFor`/`resolveCarriedSelections`
had the same shape — inside the DB transaction that holds the row locks
category PATCHes compete for.

**Verified fixed** by all three performance-efficiency auditors independently,
and spot-checked by the synthesizer: both sites now wrap the reads in
`Promise.all` (`sync-carry.ts:57-68`, `sync.ts:82-85`), with the carry-before-
delete ordering constraint preserved.

**Caveat for future audits** (from the auditor who verified against the pinned
driver, `pg@8.23.0` `lib/client.js` `_pulseQueryQueue`): non-pipelined
`pg.Client` — the mode drizzle-orm/node-postgres uses — dispatches one query
at a time per connection and waits for its full round trip before sending the
next, and a drizzle transaction runs on a single connection. So `Promise.all`
over reads sharing one `tx` does not actually reduce round trips or shrink the
lock window; the change is harmless and arguably clearer, but the performance
rationale was cosmetic. Do not re-flag same-`tx` sequential reads as fixable
this way, and do not credit a future `Promise.all` wrap of same-`tx` queries
as a genuine performance win.
