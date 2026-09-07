---
name: not-ready-poll-budgets
description: Plaid's not-ready state is polled up to 10 times per drain from sync-all (manual or scheduled), up to 3 from the link route, 2s apart — a budget cumulative across the drain, not per stall
tags:
  [
    syncTransactions,
    DEFAULT_NOT_READY_RETRIES,
    NOT_READY_DELAY_MS,
    src/lib/plaid.ts,
    notReadyRetries,
    syncAllItems,
  ]
date: 2026-09-04
---

An empty `next_cursor` means Plaid has not prepared the item yet. Sync-all — `POST /api/sync` and the scheduler, which share one runner ([[scheduled-sync]]) — can afford the full budget (10 retries). `POST /api/exchange` passes 3, because a first sync commonly hits this and a long sleep inside the link request would fail links on hosts with request timeouts. Zero retries was tried and retired. The budget is cumulative across a whole drain (it bounds total in-request sleep), not reset per stall. Exceeding the budget throws a `NOT_READY` PublicError (503) the user can act on.
