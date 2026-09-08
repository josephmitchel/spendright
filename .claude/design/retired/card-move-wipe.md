---
name: card-move-wipe
description: Clearing a transaction's card-category link when its account matches a different card than the category belongs to
tags: [upsertAccount, src/lib/accounts.ts, scripts/seed-cards.ts, syncItem cardCategoryStillValid]
date: 2026-09-04
---

Retired 2026-09-04. The wipe existed for an account moving from one card to another, which is not a scenario this app needs to support: an account's card is fixed, and the only unmatched state is a temporary naming mismatch ([[account-card-matching-by-name]]). It also rewrites old transactions because of a card-side change, which [[categorization-is-a-historical-snapshot]] forbids. Any code that clears card categories on a card mismatch, in the sync, the seed, or the carry, should go.

Removed from the code 2026-09-04: `upsertAccount` no longer touches `transactions`, the seed's per-account loop only re-matches, and the carry no longer compares the category's card to the account's.
