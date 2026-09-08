---
name: categorization-is-a-historical-snapshot
description: A categorized transaction is a historical record of the category and rate that existed when it was categorized — card-benefit changes never mutate old transactions, sync never overwrites a user's selection (except a sign flip), and a category is never cleared back to none, only replaced
tags:
  [
    transactions.card_category_id,
    transactions.reward_rate,
    card_categories,
    scripts/seed-cards.ts,
    onDelete set null,
    syncItem carry,
    src/app/accounts/[accountId]/page.tsx,
    CategorySelect,
    PATCH /api/transactions/[transactionId],
    isValidId,
    src/lib/sync.ts,
    onConflictDoUpdate,
    transactions.credit_category_id,
  ]
date: 2026-09-04
---

When a user categorizes a purchase as, say, Groceries at 6%, that pairing is a fact about the past: the category existed, the rate applied, and the user benefited from it. A later change to the card's benefits (the category removed from the seed, its rate edited, the category renamed) must leave that transaction reading exactly as it did: same category name, same rate. Old data is never rewritten because a card's current terms changed.

Consequences:

- Editing a rate in the seed applies to future picks only. The seed backfills missing rates but never overwrites one.
- Removing a category from a card retires it ([[categories-retired-not-deleted]]): it stops being offered for new picks, and every transaction that carries it keeps the link and the rate.
- The account page shows the historical category and rate as recorded. The picker renders a retired category as its disabled selected option. The "(unlinked)" rate marker now only reaches rows whose link was stripped before retirement existed, or by a hand delete.
- The pending-to-posted carry keeps both the category and the rate ([[pending-to-posted-carry]]).

Resolved 2026-09-04: the seed no longer deletes category or card rows, so the `on delete set null` FKs never fire on a catalog change.

Related: [[account-card-matching-by-name]] (unmatched is temporary), [[card-catalog-in-code]] (seed reconcile).

## Selections are user-owned (decided 2026-09-04)

Sync never overwrites a user's category selection. The sync upsert's `set` excludes the category columns of the matching kind, so re-syncs and replayed batches leave selections alone. The only exception: a `modified` transaction whose amount changes sign clears the now-wrong-kind selection (and, on a flip to inflow, the rate) because the DB constraint would otherwise reject the row.

## No category clear (decided 2026-09-04)

Once a transaction has a category there is no way to clear it back to none, in the UI or the API; a user may only re-categorize. The "none" placeholder in the picker is disabled and hidden, and that is the rule for every surface: a categorization is never retracted, only replaced. There is no reason to clear a category. Re-categorizing takes the new category's current rate, which is a user action, not a card change, so it does not violate the snapshot rule above.

Resolved 2026-09-04: `PATCH /api/transactions/[transactionId]` rejects null with a 400; `isValidId` accepts only a positive integer, and the branches that cleared a category (and, for the card kind, the recorded rate) are gone. See [[category-write-contract]].
