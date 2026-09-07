---
name: pager-keeps-stale-rows
description: A page turn keeps the previous page's rows on screen with the pager disabled instead of blanking the list
tags: [loadedPage, shownPage, pageLoading, settledPage, reloading, src/app/accounts/[accountId]/useTransactionPage.ts]
date: 2026-09-04
---

`pageLoading` is true until the request for the current page has settled (`settledPage !== page`) and no loud reload is pending (the protocol's `reloading` — since 2026-09-06 the reload token lives entirely inside `useLoadProtocol`; a silent poll refresh bumps neither, so background re-reads never disable the pager); while it is, the previous page's rows stay up and the pager is disabled rather than the account body blanking. `loadedPage` records which page the rows on screen actually came from (left alone on a failed read), and the pager's range and buttons are computed from it (`shownPage`), so the pager never describes rows that aren't showing. Extends [[transactions-paginated]].

The page-state variables and their one update rule each (moved here from a hook comment 2026-09-07 per [[comments-minimal]]):

- `page` — the page being asked for; `goToPage`, and the clamp on shrink
- `loadedPage` — the page the rows on screen came from; set on success only, -1 until the first success
- `settledPage` — the page of the request that last settled, success or failure; null until one does
- `shownPage` — derived: `loadedPage` once any read succeeded, else `page`
- `pageLoading` — derived: `settledPage !== page || reloading`; a silent refresh moves neither input
- `total` — the account's row count; null until a read lands
