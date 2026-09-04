---
name: transaction-list-ordering
description: The transaction list is ordered newest date first, ties broken by descending id
tags: [GET /api/transactions, src/app/api/transactions/route.ts, orderBy]
date: 2026-09-04
---

`/api/transactions` orders by `desc(date), desc(id)`: newest activity on top, and the id tiebreak makes the order total, so paginated pages never shuffle or duplicate rows between requests. Sibling of [[picker-ordering]].
