---
name: item-delete-plaid-first
description: DELETE /api/items removes the item at Plaid before deleting it locally; ITEM_NOT_FOUND counts as success, any other Plaid failure aborts
tags:
  [
    DELETE /api/items/[itemId],
    itemRemove,
    ITEM_NOT_FOUND,
    plaidErrorBody,
    removeItemCompletely,
    src/lib/items.ts,
    withItemSyncLock,
  ]
date: 2026-09-04
---

Plaid already having forgotten the item is idempotent success — the local row is still deleted. Any other Plaid failure (an outage, a bad token state) throws before the local delete, so the institution stays visibly connected locally rather than being silently orphaned at Plaid with its access token discarded. One exception (2026-09-07, user-confirmed after a quality audit): a token that cannot be decrypted (rotated `ENCRYPTION_KEY`, hand-edited column) skips the Plaid revoke — logged, not thrown — and the local delete proceeds, because there is nothing usable to revoke and `decrypt`'s own error message directs the user to remove and relink the affected institutions; before this, that advice routed them into a 500 with no in-app way out.

Since 2026-09-07 the whole workflow lives as `removeItemCompletely` (src/lib/items.ts, per [[thin-routes-domain-in-lib]]) and runs under the per-item sync lock ([[cross-process-sync-lock]]): the 2026-09-07 reliability audit found an unlocked delete racing a running sync yanked rows out from under it mid-transaction — no corruption (the sync's transaction rolls back), but it surfaced as a confusing uncategorized 500 instead of a clean outcome. A delete arriving during a sync now waits its turn like any other entrant.
