---
name: categorization-is-a-historical-snapshot
description: A categorized transaction is a historical record of the category and rate that existed when it was categorized; changes to a card's benefits never mutate old transactions
tags: [transactions.card_category_id, transactions.reward_rate, card_categories, scripts/seed-cards.ts, onDelete set null, syncItem carry, src/app/accounts/[accountId]/page.tsx]
date: 2026-09-04
---

When a user categorizes a purchase as, say, Groceries at 6%, that pairing is a fact about the past: the category existed, the rate applied, and the user benefited from it. A later change to the card's benefits (the category removed from the seed, its rate edited, the category renamed) must leave that transaction reading exactly as it did: same category name, same rate. Old data is never rewritten because a card's current terms changed.

Consequences:

- Editing a rate in the seed applies to future picks only. The seed backfills missing rates but never overwrites one.
- Removing a category from a card retires it ([[categories-retired-not-deleted]]): it stops being offered for new picks, and every transaction that carries it keeps the link and the rate.
- The account page shows the historical category and rate as recorded. The picker renders a retired category as its disabled selected option. The "(unlinked)" rate marker now only reaches rows whose link was stripped before retirement existed, or by a hand delete.
- The pending-to-posted carry keeps both the category and the rate ([[pending-to-posted-carry]]).

Resolved 2026-09-04: the seed no longer deletes category or card rows, so the `on delete set null` FKs never fire on a catalog change.

Related: [[no-category-clear]], [[seed-reconcile-is-destructive]], [[unmatched-is-temporary]].
