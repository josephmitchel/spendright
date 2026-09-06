---
name: partial-load-rendering
description: Each endpoint settles independently, whatever arrived is rendered, failures show beside it with Retry, and a failed read is never evidence of an empty state
tags:
  [
    Promise.allSettled,
    joinedFailureMessage,
    src/lib/http.ts,
    HomeClient refresh,
    useAccountData,
    useTransactionPage,
    loaded,
    itemsLoaded,
    Retry,
  ]
date: 2026-09-04
---

Loads use `Promise.allSettled` per endpoint, fetch and parse together, and fold failures into one on-screen message through `joinedFailureMessage` in `src/lib/http.ts`. A read that failed leaves its slice of state exactly as it was; messages that assert what the database holds ("No institutions", "Card not supported", "No transactions") are gated on the read that supports them. Errors render on screen with a Retry that clears the message on click and never blanks content that did load. Console output is not a user surface.
