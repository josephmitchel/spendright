---
characteristics: [safety]
level: minor
status: new
first-seen: 09-08-2026-225835
locations:
  - src/lib/sync.ts:94
---

# The sync-time "removed transaction" delete is not scoped to the item holding the sync lock

The only irreversible delete on the sync path (`src/lib/sync.ts:94-97`)
destroys hand-picked categories and the point-in-time `rewardRate` snapshot
with no carry/undo, and is scoped by nothing but the id list Plaid returned
— unlike every other write in the same function, which is constrained to the
item being synced (`knownAccountIdsFor` in `src/lib/sync-persist.ts:30-41`;
`recordSyncOutcome`'s item-keyed update). It runs under the per-item
advisory lock, but the statement is structurally capable of reaching rows
belonging to other items, outside the scope its own lock implies.

Current risk is low (globally-unique Plaid transaction ids, single user),
hence minor — but it is a hazard-containment gap (ISO 25010 operational
constraint).

Suggested direction: add `and(eq(transactions.itemId, item.itemId))` to the
delete predicate — `transactions_item_id_idx` already supports it at no
cost.
