---
name: shared-mutation-protocol
description: Every simple mutation runs through useAsyncAction — one definition of the in-flight guard, error state, and settle order — and its `run` returns void so async functions are never passed as DOM handlers or void-returning props
tags:
  [
    useAsyncAction,
    src/hooks/useAsyncAction.ts,
    useSyncAll,
    useItemRemoval,
    PlaidLinkButton,
    run,
    pending,
    clear,
  ]
date: 2026-09-06
---

Confirmed 2026-09-06 after a quality audit found the read side sharing one rigorous protocol ([[partial-load-rendering]]) while every mutation re-implemented "async action → try/catch → error state → maybe refresh" from scratch, with three different in-flight conventions. `useAsyncAction(action, failureMessage)` is the write-side counterpart of `useLoadProtocol`:

- One in-flight guard (a ref, so two runs in one tick cannot both pass), one `pending` flag (true while any run is in flight), one `error` rendered through `errorMessage` like every read. The guard is keyed (2026-09-06, after a quality audit found the per-hook guard silently dropping a second institution's removal while the first was in flight): a singleton action (no `key` option) drops a run arriving while one is pending, while a per-row action passes `key` — `useItemRemoval` keys on the item id — so only a re-run of the same row is dropped and different rows proceed concurrently.
- `run` returns **void** by design: it is what DOM handlers and function props receive, so `@typescript-eslint/no-misused-promises` ([[promise-discipline-linted]]) holds by construction.
- Page-specific state beside the mutation (the sync status line, the link notice) stays in the calling hook, which resets it in a catch-and-rethrow when a failure must clear it.

Consumers: `useSyncAll`, `useItemRemoval`, and both of `PlaidLinkButton`'s mutations (whose old hand-rolled 4-value status union is now derived from the two actions' `pending`/`error`). `useCategoryPatches` deliberately stays on its own protocol — per-row optimistic bursts are a different shape with their own record ([[optimistic-category-writes]]).
