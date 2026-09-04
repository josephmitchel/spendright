---
name: no-category-clear
description: Once a transaction has a category there is no way to clear it back to none, in the UI or the API; a user may only re-categorize
tags: [CategorySelect, src/app/accounts/[accountId]/page.tsx, PATCH /api/transactions/[transactionId], isValidId, cardCategoryId null, creditCategoryId null]
date: 2026-09-04
---

The "none" placeholder in the picker is disabled and hidden, and that is the rule for every surface: a categorization is never retracted, only replaced. There is no reason to clear a category. Re-categorizing takes the new category's current rate, which is a user action, not a card change, so it does not violate [[categorization-is-a-historical-snapshot]].

Known gap (2026-09-04): `PATCH /api/transactions/[transactionId]` still accepts `{ cardCategoryId: null }` and `{ creditCategoryId: null }`, and the card-kind clear also deletes `reward_rate`. Remove the null path so no caller can clear a category or destroy a recorded rate.
