---
name: transactions-paginated
description: Transactions are paginated with one shared page-size constant (PAGE_SIZE, 20) on both sides of the boundary, the API caps limit at 1000, every response carries the account's total — and bad limit/offset values are clamped, never rejected, while empty filter values are rejected as caller bugs
tags:
  [
    PAGE_SIZE,
    src/lib/pagination.ts,
    GET /api/transactions,
    limit param,
    offset,
    total count,
    src/app/accounts/[accountId]/page.tsx,
    readBound,
    GET /api/accounts,
    badRequest,
  ]
date: 2026-09-04
---

Page size is the client's decision, sent on every request. `PAGE_SIZE` lives in the dependency-free `src/lib/pagination.ts` and is imported by the client and by the route's `?limit=` fallback alike (updated 2026-09-06, raised by a quality audit: the fallback used to be a hand-matched literal, and this record used to claim a large 500-row default the code no longer had), so a hand-written request without `?limit=` gets the same page shape the app serves. `total` is a separate count query so an offset past the end still reports the real count and the client can clamp back to the last page. The pager renders even for a single page so "1–17 of 17" answers "is this all of them".

## Query bounds clamped (decided 2026-09-04)

`limit` and `offset` are truncated and clamped onto their ranges; absent, zero, and non-numeric take the default (the transactions default matches the client's page size, so the no-param shape is the tested one). By contrast `?accountId=` with an empty value is a 400, because an empty value means the caller built the URL from an empty variable and the unfiltered fallback would return the wrong data. (`/api/accounts` once also took an `?itemId=` filter; removed 2026-09-06 — no caller ever used it.)
