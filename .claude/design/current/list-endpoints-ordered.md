---
name: list-endpoints-ordered
description: Every list endpoint orders its rows explicitly; /api/items and /api/accounts order by id (creation order) so the home page never reshuffles under the poll
tags:
  [
    GET /api/items,
    GET /api/accounts,
    orderBy,
    src/app/api/items/route.ts,
    src/app/api/accounts/route.ts,
  ]
date: 2026-09-06
---

No list endpoint relies on physical row order: the hourly sync rewrites every item and account row, Postgres relocates updated rows, and the home page re-reads every minute, so an unordered select can reshuffle sections and rows under the user with no input. `/api/items` and `/api/accounts` order by `id` — creation order, stable across syncs. Sibling of [[transaction-list-ordering]] and [[picker-ordering]]; same rule as the card catalog loader's ordering.

Raised by the 2026-09-06 quality audit and confirmed by the user.
