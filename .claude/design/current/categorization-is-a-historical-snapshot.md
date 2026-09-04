---
name: categorization-is-a-historical-snapshot
description: A categorized transaction is a historical record of the category and rate that existed when it was categorized; changes to a card's benefits never mutate old transactions
tags: [transactions.card_category_id, transactions.reward_rate, card_categories, scripts/seed-cards.ts, onDelete set null, syncItem carry, src/app/accounts/[accountId]/page.tsx]
date: 2026-09-04
---

When a user categorizes a purchase as, say, Groceries at 6%, that pairing is a fact about the past: the category existed, the rate applied, and the user benefited from it. A later change to the card's benefits (the category removed from the seed, its rate edited, the category renamed) must leave that transaction reading exactly as it did: same category name, same rate. Old data is never rewritten because a card's current terms changed.

Consequences:
- Editing a rate in the seed applies to future picks only. The seed backfills missing rates but never overwrites one.
- Removing a category from a card stops it being offered for new picks. It must not erase the category or the rate from transactions that already carry it.
- The account page shows the historical category and rate as recorded. An "(unlinked)" marker is only acceptable as an interim rendering; the intended display is the category name that was picked.
- The pending-to-posted carry keeps both the category and the rate ([[pending-to-posted-carry]]).

Known gap (2026-09-04): `card_categories` rows are deleted by the seed reconcile and the FK is `on delete set null`, so today a removed category is stripped from old transactions while only the rate survives. That violates this rule and should be flagged until fixed. The fix is implementation detail (snapshot the name on the row, or retire categories instead of deleting them) and is not decided here.

Related: [[no-category-clear]], [[seed-reconcile-is-destructive]], [[unmatched-is-temporary]].
