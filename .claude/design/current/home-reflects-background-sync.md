---
name: home-reflects-background-sync
description: Both pages re-read their data once a minute while the tab is visible and on return to it (useVisiblePoll), so an hourly scheduled sync shows up without a reload; the connect-notice expiry stays keyed to a manual Sync all
tags:
  [HomeClient, useVisiblePoll, src/components/useVisiblePoll.ts, AccountView, refresh, visibilitychange, scheduled sync, polling]
date: 2026-09-05
---

Confirmed by the user 2026-09-05 (raised by the design audit after [[scheduled-sync]] landed): the home page must reflect a background scheduled sync — which mutates `items.error` and balances behind an already-open page — without a reload. Mechanism: `HomeClient` polls its existing `refresh()` (items + accounts) every 60 seconds while the tab is visible, and refreshes immediately when the tab becomes visible again; both are skipped while hidden. Polling was chosen over SSE/websockets — the payloads are two small loopback reads, and the staleness bound (≤1 minute against an hourly sync) doesn't justify a push channel. The existing generation counter makes a superseded poll write nothing ([[superseded-loads-write-nothing]]), so polling can never clobber a fresher read. Deliberately unchanged: [[link-notice-expires-on-clean-sync]] stays keyed to a manual "Sync all" — a background sync does not expire the connect-time notice.

Extended 2026-09-06 (confirmed by the user, raised by a quality audit): the account page polls too — the background sync mutates transactions and balances behind an open account page just as it does behind home. The polling idiom lives once in `useVisiblePoll` (src/components/useVisiblePoll.ts), used by both pages. Reload plumbing was unified at the same time: `useLoadProtocol` owns a `reload()`/`reloadToken` pair (loud re-run: Retry, same-page goToPage), and each data hook also exposes its load as a silent `refresh` callback, which is what the poll calls — so a background poll never flips the pager's in-flight state or disables its buttons; the caller-owned `reloadKey` counter that the account page used to thread through its hooks is gone.
