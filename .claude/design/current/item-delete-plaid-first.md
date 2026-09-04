---
name: item-delete-plaid-first
description: DELETE /api/items removes the item at Plaid before deleting it locally; ITEM_NOT_FOUND counts as success, any other Plaid failure aborts
tags: [DELETE /api/items/[itemId], itemRemove, ITEM_NOT_FOUND, plaidErrorBody]
date: 2026-09-04
---

Plaid already having forgotten the item is idempotent success — the local row is still deleted. Any other Plaid failure (an outage, a bad token state) throws before the local delete, so the institution stays visibly connected locally rather than being silently orphaned at Plaid with its access token discarded.
