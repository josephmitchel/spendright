---
name: partial-load-rendering
description: Each endpoint settles independently, whatever arrived is rendered, failures show beside it with Retry, and a failed read is never evidence of an empty state
tags:
  [
    Promise.allSettled,
    settleReads,
    src/hooks/useLoadProtocol.ts,
    home page refresh,
    useHomeData,
    useAccountData,
    useTransactionPage,
    settled,
    loaded,
    Retry,
  ]
date: 2026-09-04
---

Loads go through `useLoadProtocol` (`src/hooks/useLoadProtocol.ts`), which owns the whole lifecycle **including the load effect itself** (2026-09-06, user-confirmed after a quality audit found the three hooks wiring the effect three different ways — one via a dep-array entry unused in the effect body, prunable into a silent no-op Retry): each data hook passes a memoized `perform(load)` callback whose useCallback deps are the read's inputs (account id, page), and the protocol runs it on mount, on identity change, and on `reload()`. `load` settles the reads via `settleReads` (private to useLoadProtocol.ts since 2026-09-06, user-confirmed — it is the hook's only helper and renders user-facing strings, so moving it out of `src/lib/serialize.ts` left that module dependency-free for its server importers; previously moved there from http.ts 2026-09-06; the single definition: a keyed set of reads settles together so one failure never discards a sibling that arrived, each failure is logged and folded into one on-screen message, and `succeeded` yields one boolean per read), hands the outcomes to the hook's `apply`, and then writes `loaded`/`error`/`settled` in one fixed sequence (2026-09-06, after a quality audit found the three hooks each hand-rolling that sequence around the packaged state, with orderings already drifted). Every data hook exposes the same shape: `settled` (the first load finished, success or failure), `error` / `clearError`, and `loaded` — always an object with one boolean per read (`loaded.items`, `loaded.account`, `loaded.transactions`, …), never a bare boolean, so the name means one thing across hooks. A read that failed leaves its slice of state exactly as it was; messages that assert what the database holds ("No institutions", "Card not supported", "No transactions") are gated on the read that supports them. Stickiness is declared, not hand-coded: `stickyKeys` names the reads whose `loaded` stays true once any load succeeded — the home page's `accounts` is sticky (rendered rows survive a failed poll) while every other key follows the latest load (an empty-state claim needs current evidence). The account page folds its render gating into one derived view state (`loading` / `not-found` / `unsupported` / `ready` / `unresolved`, `deriveView` in page.tsx), so the legal states are enumerated once instead of re-encoded per branch. Errors render on screen with a Retry that clears the message on click and never blanks content that did load. Console output is not a user surface. The memoized-`perform` contract is guarded at runtime (2026-09-06, [[promise-discipline-linted]]): no lint can check it, so the load effect counts its own firings; a rate only the unmemoized-`perform` fetch loop can explain throws in development and, in production (added 2026-09-06 — the guard was dev-only, leaving production to hammer the API silently), logs and skips the firing, which starves the loop without crashing the page. The protocol's read-once parameters (`initialLoaded`, `stickyKeys`) carry the same kind of sensor (2026-09-06): they are captured on the first render, so a development-mode effect value-compares later renders' params and throws on a change instead of silently ignoring it.
