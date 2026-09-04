---
name: not-ready-poll-budgets
description: Plaid's not-ready state is polled 10 times from Sync all and 3 times from the link route, 2s apart
tags: [syncTransactions, DEFAULT_NOT_READY_RETRIES, NOT_READY_DELAY_MS, src/lib/plaid.ts, notReadyRetries]
date: 2026-09-04
---

An empty `next_cursor` means Plaid has not prepared the item yet. `POST /api/sync` can afford the full budget (10 retries). `POST /api/exchange` passes 3, because a first sync commonly hits this and a long sleep inside the link request would fail links on hosts with request timeouts. Zero retries was tried and retired. Exceeding the budget throws a `NOT_READY` PublicError (503) the user can act on.
