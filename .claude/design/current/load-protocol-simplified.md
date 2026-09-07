---
name: load-protocol-simplified
description: The client load protocol was simplified in place (2026-09-06) — no runtime self-policing sensors, apply receives plain bodies (null on failure), and reloading is a boolean; the memoized-perform contract is documented, not runtime-enforced
tags:
  [src/hooks/useLoadProtocol.ts, LoadReads, apply callback, reloading, latestTicket, perform, useCallback]
date: 2026-09-06
---

Decided by the user 2026-09-06 after a quality audit flagged the client async-state machinery as the codebase's complexity concentration. Chosen fix: simplify in place rather than adopt a fetching library (tests are deferred, so a rewrite had no safety net).

What changed in `src/hooks/useLoadProtocol.ts`:

- The two development-mode sensors (the first-render params comparator and the effect-storm counter) are gone, including the production fork that silently skipped a refresh. An abstraction policing its own callers at runtime was judged framework-grade machinery a three-call-site hook does not need. The caller contract stands but is documented only: `perform` must be memoized (`useCallback` keyed on its read inputs) because the load effect re-runs on its identity; `initialLoaded`/`stickyKeys` are read once. `react-hooks/exhaustive-deps` as an error remains the lint-side backstop.
- `apply` now receives plain bodies — the read's value, or `null` where it failed — instead of `PromiseSettledResult`s, so consumers stop re-deriving "did it succeed" in three different styles.
- The three-counter reloading relation (`settledTicket < loudFromTicket`) is replaced by one `reloading` boolean set by `reload()` and cleared when the next un-superseded load settles; the single `latestTicket` ref still implements [[superseded-loads-write-nothing]].

Alongside, returned callbacks are memoized consistently (`setCategory`, `goToPage`, the useCategoryPatches internals), since an unmemoized callback in a dep array is exactly the loop the deleted sensor existed to catch.
