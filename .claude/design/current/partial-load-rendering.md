---
name: partial-load-rendering
description: The client load protocol — each endpoint settles independently and whatever arrived renders with failures beside it (Retry included, a failed read never evidence of an empty state); a load superseded by a newer one writes nothing via one monotonic ticket inside useLoadProtocol; the protocol was deliberately simplified in place (no runtime self-policing, plain bodies, one reloading boolean)
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
    latestTicket,
    reloading,
    src/app/accounts/[accountId]/useAccountData.ts,
    src/app/accounts/[accountId]/useTransactionPage.ts,
    LoadReads,
    apply callback,
    perform,
    useCallback,
  ]
date: 2026-09-04
---

Loads go through `useLoadProtocol` (`src/hooks/useLoadProtocol.ts`), which owns the whole lifecycle **including the load effect itself** (2026-09-06, user-confirmed after a quality audit found the three hooks wiring the effect three different ways — one via a dep-array entry unused in the effect body, prunable into a silent no-op Retry): each data hook passes a memoized `perform(load)` callback whose useCallback deps are the read's inputs (account id, page), and the protocol runs it on mount, on identity change, and on `reload()`. `load` settles the reads via `settleReads` (private to useLoadProtocol.ts since 2026-09-06, user-confirmed — it is the hook's only helper and renders user-facing strings, so moving it out of the shared async module (`src/lib/async-coordination.ts`, named serialize.ts until 2026-09-07) left that module dependency-free for its server importers; previously moved there from http.ts 2026-09-06; the single definition: a keyed set of reads settles together so one failure never discards a sibling that arrived, each failure is logged and folded into one on-screen message, and `succeeded` yields one boolean per read), hands the outcomes to the hook's `apply`, and then writes `loaded`/`error`/`settled` in one fixed sequence (2026-09-06, after a quality audit found the three hooks each hand-rolling that sequence around the packaged state, with orderings already drifted). Every data hook exposes the same shape: `settled` (the first load finished, success or failure), `error` / `clearError`, and `loaded` — always an object with one boolean per read (`loaded.items`, `loaded.account`, `loaded.transactions`, …), never a bare boolean, so the name means one thing across hooks. A read that failed leaves its slice of state exactly as it was; messages that assert what the database holds ("No institutions", "Card not supported", "No transactions") are gated on the read that supports them. Stickiness is declared, not hand-coded: `stickyKeys` names the reads whose `loaded` stays true once any load succeeded — the home page's `accounts` is sticky (rendered rows survive a failed poll) while every other key follows the latest load (an empty-state claim needs current evidence). The account page folds its render gating into one derived view state (`loading` / `not-found` / `unsupported` / `ready` / `unresolved`, `deriveView` in page.tsx), so the legal states are enumerated once instead of re-encoded per branch. Errors render on screen with a Retry that clears the message on click and never blanks content that did load. Console output is not a user surface. The memoized-`perform` contract and the read-once parameters (`initialLoaded`, `stickyKeys`) are documented caller contracts, not runtime-enforced: the runtime sensors that briefly policed them were deleted the same day they were added (2026-09-06, user-confirmed — see the simplification section below), with `react-hooks/exhaustive-deps` as an error remaining the lint-side backstop.

## Superseded loads write nothing (decided 2026-09-04)

Every data load runs through `useLoadProtocol`, whose `load` takes the next ticket from one monotonic counter at start and discards the whole settle — `apply` included — if a later load has started (2026-09-06, replacing the earlier per-hook split where the home hook used a counter and the account-page hooks used `cancelled` flags: two mechanisms for one rule was itself the drift the quality audit flagged). A load settling after unmount is a no-op setState. Reloading sits beside the counter as one plain boolean (simplified 2026-09-06, user-confirmed — the simplification below replaced an earlier three-counter relation): `reload()` sets `reloading` and the next un-superseded settle clears it. The ticket never leaves the protocol. `useTransactionPage`'s `pageLoading` is `settledPage !== page || reloading`, so a Retry of the same page still counts as in flight while a silent poll refresh (no loud threshold, current page) never flips it ([[home-reflects-background-sync]]). This section decides which read is allowed to write state at all; the rendering rules above decide what renders when reads fail.

## Load protocol simplified in place (decided 2026-09-06)

Decided by the user 2026-09-06 after a quality audit flagged the client async-state machinery as the codebase's complexity concentration. Chosen fix: simplify in place rather than adopt a fetching library (tests are deferred, so a rewrite had no safety net).

What changed in `src/hooks/useLoadProtocol.ts`:

- The two development-mode sensors (the first-render params comparator and the effect-storm counter) are gone, including the production fork that silently skipped a refresh. An abstraction policing its own callers at runtime was judged framework-grade machinery a three-call-site hook does not need. The caller contract stands but is documented only: `perform` must be memoized (`useCallback` keyed on its read inputs) because the load effect re-runs on its identity; `initialLoaded`/`stickyKeys` are read once. `react-hooks/exhaustive-deps` as an error remains the lint-side backstop.
- `apply` now receives plain bodies — the read's value, or `null` where it failed — instead of `PromiseSettledResult`s, so consumers stop re-deriving "did it succeed" in three different styles.
- The three-counter reloading relation (`settledTicket < loudFromTicket`) is replaced by one `reloading` boolean set by `reload()` and cleared when the next un-superseded load settles; the single `latestTicket` ref still implements the superseded-loads rule above.

Alongside, returned callbacks are memoized consistently (`setCategory`, `goToPage`, the useCategoryPatches internals), since an unmemoized callback in a dep array is exactly the loop the deleted sensor existed to catch.
