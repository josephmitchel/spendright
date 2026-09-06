---
name: optimistic-category-writes
description: Category picks apply optimistically; PATCHes are serialized per row so at most one is in flight, and the row's category fields reconcile to the newest committed response or the pre-burst baseline
tags: [useCategoryPatches, setCategory, patchState, patchChain, src/app/accounts/[accountId]/useCategoryPatches.ts, PATCH /api/transactions/[transactionId]]
date: 2026-09-04
---

A category pick writes into the row immediately so the controlled select never snaps back. Each row keeps a promise chain (`patchChain`) so it has at most one PATCH in flight and issue, commit and response order agree. Because sends settle strictly in issue order, a pending counter is the whole bookkeeping (`patchState`: pending count, pre-burst baseline row, newest committed server row — an explicit sequence number would be redundant with the chain): the counter hits zero exactly when the burst's newest patch settles, which is when the row reconciles — newest committed response, else the baseline — and when that patch's outcome (only) is surfaced, inline next to the table rather than via alert(). Reconciliation merges only the category columns into the current row, so a page re-fetch that landed mid-burst keeps its fresher non-category data. Works alongside [[no-category-clear]] and [[category-write-contract]]; responses go through [[single-response-reader]].
