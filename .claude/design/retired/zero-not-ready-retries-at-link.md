---
name: zero-not-ready-retries-at-link
description: Passing notReadyRetries 0 from the link route
tags: [src/app/api/exchange/route.ts, notReadyRetries, syncTransactions]
date: 2026-09-04
---

Retired 2026-09-03. With zero retries essentially every connect ended in NOT_READY and wrote an item error. Replaced by 3 retries (about 6s), see [[not-ready-poll-budgets]].
