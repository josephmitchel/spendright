---
name: indefinite-cursor-hold
description: Holding an item's sync cursor back forever when transactions arrive for an unstored account, relying on items.error alone
tags: [syncItem, items.cursor, skippedSyncs, MAX_SKIPPED_SYNCS]
date: 2026-09-04
---

Retired 2026-09-03. An account that could never be stored held the cursor indefinitely while the replayed batch only grew. Replaced by a bounded hold that drops the batch after a fixed number of consecutive skips.
