---
name: query-bounds-clamped
description: Bad limit and offset values are clamped, never rejected; empty filter values are rejected as caller bugs
tags: [readBound, GET /api/transactions, GET /api/accounts, badRequest]
date: 2026-09-04
---

`limit` and `offset` are truncated and clamped onto their ranges; absent, zero, and non-numeric take the default (the transactions default matches the client's page size, so the no-param shape is the tested one). By contrast `?accountId=` with an empty value is a 400, because an empty value means the caller built the URL from an empty variable and the unfiltered fallback would return the wrong data. (`/api/accounts` once also took an `?itemId=` filter; removed 2026-09-06 — no caller ever used it.)
