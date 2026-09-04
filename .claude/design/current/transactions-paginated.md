---
name: transactions-paginated
description: Transactions are paginated; the account page asks for 20, the API defaults to 500 with a cap of 1000, and every response carries the account's total
tags: [PAGE_SIZE, GET /api/transactions, limit, offset, total, src/app/accounts/[accountId]/page.tsx]
date: 2026-09-04
---

Page size is the client's decision, sent on every request. The API default stays large for callers that name no limit. `total` is a separate count query so an offset past the end still reports the real count and the client can clamp back to the last page. The pager renders even for a single page so "1–17 of 17" answers "is this all of them".
