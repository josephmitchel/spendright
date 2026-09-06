---
name: superseded-loads-write-nothing
description: A load superseded by a newer one writes nothing; the one staleness mechanism is the generation counter inside useLoadProtocol's load()
tags:
  [
    useLoadProtocol,
    load,
    generation,
    src/components/useLoadProtocol.ts,
    useHomeData,
    src/app/accounts/[accountId]/useAccountData.ts,
    src/app/accounts/[accountId]/useTransactionPage.ts,
    settledRequest,
  ]
date: 2026-09-04
---

Every data load runs through `useLoadProtocol` (`src/components/useLoadProtocol.ts`), whose `load` takes a ticket from a generation counter and discards the whole settle — `apply` included — if a later load has started (2026-09-06, replacing the earlier per-hook split where the home hook used a counter and the account-page hooks used `cancelled` flags: two mechanisms for one rule was itself the drift the quality audit flagged). A load settling after unmount is a no-op setState. The reload token never leaves the protocol (2026-09-06, user-confirmed): the protocol tracks the token each un-superseded load started with and exposes `reloading` — true from `reload()` until a load begun at or after it settles — so `useTransactionPage`'s `pageLoading` is `settledPage !== page || reloading`, and a Retry of the same page still counts as in flight while a silent poll refresh (no token bump, current page) never flips it ([[home-reflects-background-sync]]). Sibling of [[partial-load-rendering]]: that record decides what renders when reads fail; this one decides which read is allowed to write state at all.
