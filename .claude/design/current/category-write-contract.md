---
name: category-write-contract
description: PATCH takes exactly one category key, validates ownership inside a row lock with a 3s lock_timeout, and maps lock and FK failures to retryable 503 and 409
tags: [PATCH /api/transactions/[transactionId], RejectedRequest, lock_timeout, LOCKED, CATEGORY_REMOVED, for update, for share]
date: 2026-09-04
---

Body is `{ cardCategoryId }` or `{ creditCategoryId }`, never both, value a positive integer or null. The row is locked `for update`, the account `for share`, and the category must belong to the account's card. Rejections inside the transaction are thrown so it rolls back. 55P03 and 40P01 answer `LOCKED` 503; 23503 answers `CATEGORY_REMOVED` 409. The response carries the updated row with both category names resolved, minus the raw payload.
