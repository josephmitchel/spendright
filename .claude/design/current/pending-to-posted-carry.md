---
name: pending-to-posted-carry
description: Selections are carried from a pending transaction to its posted replacement, best-effort and only within one sync
tags: [syncItem, pending_transaction_id, carried, src/lib/sync.ts]
date: 2026-09-04
---

Plaid reposts a pending transaction under a new id. The sync reads the pending rows (locked `for update`), carries the card category, rate and credit category to the posted row, then deletes the pending row. The carry is unconditional apart from the sign rule ([[category-kind-sign-rule]]): a pick is history and rides along whatever has since changed on the card side ([[categorization-is-a-historical-snapshot]]). The account's current card is not consulted, and a retired category carries like any other.

The one check is that the category row still exists, because a carry is a fresh insert that no FK set-null can clean up and a stale id would wedge the sync. The seed never deletes category rows any more ([[categories-retired-not-deleted]]), so this only guards a hand delete.

This only works when removal and replacement arrive in the same sync; a split across syncs loses the selection. Accepted: the failure is speculative and persisting the carry would need a table nothing else uses.

Resolved 2026-09-04: the carry no longer drops a card category on a card mismatch.
