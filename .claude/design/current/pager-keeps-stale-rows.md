---
name: pager-keeps-stale-rows
description: A page turn keeps the previous page's rows on screen with the pager disabled instead of blanking the list
tags: [loadedPage, shownPage, pageLoading, src/app/accounts/[accountId]/page.tsx]
date: 2026-09-04
---

`pageLoading` is true until the request for the current `{page, reloadKey}` settles; while it is, the previous page's rows stay up and the pager is disabled rather than the account body blanking. `loadedPage` records which page the rows on screen actually came from (left alone on a failed read), and the pager's range and buttons are computed from it (`shownPage`), so the pager never describes rows that aren't showing. Extends [[transactions-paginated]].
