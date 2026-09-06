---
name: selections-are-user-owned
description: Sync never overwrites a user's category selection; the only exception is a sign flip on a modified transaction
tags:
  [
    syncItem,
    src/lib/sync.ts,
    onConflictDoUpdate,
    transactions.card_category_id,
    transactions.credit_category_id,
  ]
date: 2026-09-04
---

The sync upsert's `set` excludes the category columns of the matching kind, so re-syncs and replayed batches leave selections alone. A `modified` transaction whose amount changes sign clears the now-wrong-kind selection (and, on a flip to inflow, the rate) because the DB constraint would otherwise reject the row.
