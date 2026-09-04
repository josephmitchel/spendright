---
name: optimistic-category-writes
description: Category picks apply optimistically; PATCHes are serialized per row so at most one is in flight, and the row reconciles to the newest committed response or the pre-burst baseline
tags: [setCategory, patchState, patchChain, src/app/accounts/[accountId]/page.tsx, PATCH /api/transactions/[transactionId]]
date: 2026-09-04
---

A category pick writes into the row immediately so the controlled select never snaps back. Each row keeps a promise chain (`patchChain`) so it has at most one PATCH in flight and issue, commit and response order agree, plus bookkeeping (`patchState`): newest issued seq, pending count, the pre-burst baseline row, and the newest committed server row. Only when the last patch of a burst settles is the row reconciled — newest committed response, else the baseline — and only the newest patch's failure is reported. Nothing is written after unmount. Works alongside [[no-category-clear]] and [[category-write-contract]]; responses go through [[single-response-reader]].
