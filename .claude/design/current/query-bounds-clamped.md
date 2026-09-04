---
name: query-bounds-clamped
description: Bad limit and offset values are clamped, never rejected; empty filter values are rejected as caller bugs
tags: [readBound, GET /api/transactions, GET /api/accounts, badRequest]
date: 2026-09-04
---

`limit` and `offset` are truncated and clamped onto their ranges; absent, zero, and non-numeric take the default. By contrast `?accountId=` or `?itemId=` with an empty value is a 400, because an empty value means the caller built the URL from an empty variable and the unfiltered fallback would return the wrong data.
