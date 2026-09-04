---
name: no-category-clear
description: Once a transaction has a category there is no way to clear it back to none, in the UI or the API; a user may only re-categorize
tags: [CategorySelect, src/app/accounts/[accountId]/page.tsx, PATCH /api/transactions/[transactionId], isValidId]
date: 2026-09-04
---

The "none" placeholder in the picker is disabled and hidden, and that is the rule for every surface: a categorization is never retracted, only replaced. There is no reason to clear a category. Re-categorizing takes the new category's current rate, which is a user action, not a card change, so it does not violate [[categorization-is-a-historical-snapshot]].

Resolved 2026-09-04: `PATCH /api/transactions/[transactionId]` rejects null with a 400; `isValidId` accepts only a positive integer, and the branches that cleared a category (and, for the card kind, the recorded rate) are gone. See [[category-write-contract]].
