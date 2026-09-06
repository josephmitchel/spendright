---
name: single-card-catalog-loader
description: loadCardCatalog in src/lib/card-catalog.ts is the one loader of matchCard's input; a catalog read failure aborts the caller's operation rather than storing accounts unmatched
tags: [src/lib/card-catalog.ts, loadCardCatalog, listOfferedCards, matchCard, storeAccounts]
date: 2026-09-06
---

The ordered card read (`order by id`, so matching never depends on physical row order — [[account-card-matching-by-name]]) was copied in three places with three failure policies; it now lives once in `src/lib/card-catalog.ts`, which takes the drizzle executor as a parameter (like `matchCard`, no db import) so the seed script can use it without opening a second pool. The unified failure policy is to propagate: because `card_id` is re-matched on every account write ([[rematch-on-every-sync]]), storing accounts against an empty catalog would overwrite their matches with null, so no caller stores accounts on a failed catalog read — the link request or sync fails instead. `listOfferedCards` (the pickers' retired-filtered view, [[picker-ordering]]) lives alongside it. Confirmed 2026-09-06.
