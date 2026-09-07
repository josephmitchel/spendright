---
name: superseded-loads-write-nothing
description: A load superseded by a newer one writes nothing, enforced by one monotonic ticket counter inside useLoadProtocol; reloading is a plain boolean beside it
tags:
  [
    useLoadProtocol,
    load call,
    latestTicket,
    reloading,
    src/hooks/useLoadProtocol.ts,
    useHomeData,
    src/app/accounts/[accountId]/useAccountData.ts,
    src/app/accounts/[accountId]/useTransactionPage.ts,
  ]
date: 2026-09-04
---

Every data load runs through `useLoadProtocol` (`src/hooks/useLoadProtocol.ts`), whose `load` takes the next ticket from one monotonic counter at start and discards the whole settle — `apply` included — if a later load has started (2026-09-06, replacing the earlier per-hook split where the home hook used a counter and the account-page hooks used `cancelled` flags: two mechanisms for one rule was itself the drift the quality audit flagged). A load settling after unmount is a no-op setState. Reloading sits beside the counter as one plain boolean (simplified 2026-09-06, user-confirmed — [[load-protocol-simplified]] replaced an earlier three-counter relation): `reload()` sets `reloading` and the next un-superseded settle clears it. The ticket never leaves the protocol. `useTransactionPage`'s `pageLoading` is `settledPage !== page || reloading`, so a Retry of the same page still counts as in flight while a silent poll refresh (no loud threshold, current page) never flips it ([[home-reflects-background-sync]]). Sibling of [[partial-load-rendering]]: that record decides what renders when reads fail; this one decides which read is allowed to write state at all.
