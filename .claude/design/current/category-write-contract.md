---
name: category-write-contract
description: PATCH takes exactly one category key with a positive integer, validates ownership and retirement inside a row lock with a 3s lock_timeout, and maps lock and FK failures to retryable 503 and 409
tags: [PATCH /api/transactions/[transactionId], RejectedRequest, lock_timeout, LOCKED, CATEGORY_REMOVED, for update, for share, retired_at]
date: 2026-09-04
---

Body is `{ cardCategoryId }` or `{ creditCategoryId }`, never both, value a positive integer. Null is a 400 ([[no-category-clear]]). The row is locked `for update` and the account `for share` for both kinds; the account must have a card ([[supported-account-rule]]), a card category must belong to that card, and a category of either kind must not be retired ([[categories-retired-not-deleted]]), each a 400. Rejections inside the transaction are thrown so it rolls back. 55P03 and 40P01 answer `LOCKED` 503; 23503 answers `CATEGORY_REMOVED` 409, now reachable only by a hand delete. The response carries the updated row with both category names, minus the raw payload; the kind not written is null by the sign constraint, so no second lookup is made.
