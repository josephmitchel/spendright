---
name: list-endpoints-ordered
description: Every list endpoint orders its rows explicitly — /api/items and /api/accounts by id (creation order), /api/transactions by date desc then id desc, /api/cards by rate desc then name (credit categories by name)
tags:
  [
    GET /api/items,
    GET /api/accounts,
    GET /api/transactions,
    GET /api/cards,
    orderBy,
    src/app/api/items/route.ts,
    src/app/api/accounts/route.ts,
    src/app/api/transactions/route.ts,
    src/app/api/cards/route.ts,
  ]
date: 2026-09-04
---

No list endpoint relies on physical row order: the hourly sync rewrites every item and account row, Postgres relocates updated rows, and the home page re-reads every minute, so an unordered select can reshuffle sections and rows under the user with no input. `/api/items` and `/api/accounts` order by `id` — creation order, stable across syncs. Same rule as the card catalog loader's ordering. Raised by the 2026-09-06 quality audit and confirmed by the user.

## Transaction list ordering (decided 2026-09-04)

`/api/transactions` orders by `desc(date), desc(id)`: newest activity on top, and the id tiebreak makes the order total, so paginated pages never shuffle or duplicate rows between requests.

## Picker ordering (decided 2026-09-04)

`/api/cards` orders card categories by rate descending then name, and credit categories by name, so picker order is stable across reloads and seed runs.
