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

Loads go through `settleReads` in `src/lib/http.ts` — the single definition (2026-09-06, replacing the per-hook `Promise.allSettled` + failure-fold copies that had drifted into three naming schemes): a keyed set of reads settles together so one failure never discards a sibling that arrived, each failure is logged and folded into one on-screen message, and `succeeded` yields one boolean per read. Every data hook exposes the same shape: `settled` (the first load finished, success or failure), `error` / `clearError`, and `loaded` — always an object with one boolean per read (`loaded.items`, `loaded.account`, `loaded.transactions`, …), never a bare boolean, so the name means one thing across hooks. A read that failed leaves its slice of state exactly as it was; messages that assert what the database holds ("No institutions", "Card not supported", "No transactions") are gated on the read that supports them — which is why the home page's `loaded.items` follows the latest refresh while `loaded.accounts` is sticky (rendered rows survive a failed poll; an empty-state claim needs current evidence). The account page folds its render gating into one derived view state (`loading` / `not-found` / `unsupported` / `ready` / `unresolved`, `deriveView` in page.tsx), so the legal states are enumerated once instead of re-encoded per branch. Errors render on screen with a Retry that clears the message on click and never blanks content that did load. Console output is not a user surface.
