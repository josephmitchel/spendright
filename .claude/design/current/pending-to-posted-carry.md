---
name: pending-to-posted-carry
description: Selections are carried from a pending transaction to its posted replacement, best-effort and only within one sync
tags: [syncItem, pending_transaction_id, carried, src/lib/sync.ts]
date: 2026-09-04
---

Plaid reposts a pending transaction under a new id. The sync reads the pending rows (locked `for update`), carries the card category, rate and credit category to the posted row, then deletes the pending row. The carry is unconditional apart from the sign rule ([[category-kind-sign-rule]]): a pick is history and rides along whatever has since changed on the card side ([[categorization-is-a-historical-snapshot]]).

This only works when removal and replacement arrive in the same sync; a split across syncs loses the selection. Accepted: the failure is speculative and persisting the carry would need a table nothing else uses.

Known gap (2026-09-04): the carry drops a card category whose card is not the account's current card, and drops any category id that no longer exists. Both are consequences of the retired [[card-move-wipe]] and the seed deleting category rows.
