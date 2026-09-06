---
name: partial-load-rendering
description: Each endpoint settles independently, whatever arrived is rendered, failures show beside it with Retry, and a failed read is never evidence of an empty state
tags:
  [
    Promise.allSettled,
    settleReads,
    src/lib/http.ts,
    HomeClient refresh,
    useHomeData,
    useAccountData,
    useTransactionPage,
    settled,
    loaded,
    Retry,
  ]
date: 2026-09-04
---

Loads go through `useLoadProtocol().load()` (`src/components/useLoadProtocol.ts`), which owns the whole lifecycle — it settles the reads via `settleReads` in `src/lib/http.ts` (the single definition: a keyed set of reads settles together so one failure never discards a sibling that arrived, each failure is logged and folded into one on-screen message, and `succeeded` yields one boolean per read), hands the outcomes to the hook's `apply`, and then writes `loaded`/`error`/`settled` in one fixed sequence (2026-09-06, after a quality audit found the three hooks each hand-rolling that sequence around the packaged state, with orderings already drifted). Every data hook exposes the same shape: `settled` (the first load finished, success or failure), `error` / `clearError`, and `loaded` — always an object with one boolean per read (`loaded.items`, `loaded.account`, `loaded.transactions`, …), never a bare boolean, so the name means one thing across hooks. A read that failed leaves its slice of state exactly as it was; messages that assert what the database holds ("No institutions", "Card not supported", "No transactions") are gated on the read that supports them. Stickiness is declared, not hand-coded: `stickyKeys` names the reads whose `loaded` stays true once any load succeeded — the home page's `accounts` is sticky (rendered rows survive a failed poll) while every other key follows the latest load (an empty-state claim needs current evidence). The account page folds its render gating into one derived view state (`loading` / `not-found` / `unsupported` / `ready` / `unresolved`, `deriveView` in page.tsx), so the legal states are enumerated once instead of re-encoded per branch. Errors render on screen with a Retry that clears the message on click and never blanks content that did load. Console output is not a user surface.
