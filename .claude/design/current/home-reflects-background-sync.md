---
name: home-reflects-background-sync
description: Both pages re-read their data once a minute while the tab is visible and on return to it (useVisiblePoll), so an hourly scheduled sync shows up without a reload; the connect-notice expiry stays keyed to a manual Sync all
tags:
  [
    src/app/page.tsx,
    useVisiblePoll,
    src/hooks/useVisiblePoll.ts,
    AccountView,
    refresh,
    visibilitychange,
    scheduled sync,
    visibility polling,
  ]
date: 2026-09-05
---

Confirmed by the user 2026-09-05 (raised by the design audit after [[scheduled-sync]] landed): the home page must reflect a background scheduled sync — which mutates `items.error` and balances behind an already-open page — without a reload. Mechanism: the home page (`src/app/page.tsx`) polls its existing `refresh()` (items + accounts) every 60 seconds while the tab is visible, and refreshes immediately when the tab becomes visible again; both are skipped while hidden. Polling was chosen over SSE/websockets — the payloads are two small loopback reads, and the staleness bound (≤1 minute against an hourly sync) doesn't justify a push channel. The existing generation counter makes a superseded poll write nothing ([[superseded-loads-write-nothing]]), so polling can never clobber a fresher read. Deliberately unchanged: [[link-notice-expires-on-clean-sync]] stays keyed to a manual "Sync all" — a background sync does not expire the connect-time notice.

Extended 2026-09-06 (confirmed by the user, raised by a quality audit): the account page polls too — the background sync mutates transactions and balances behind an open account page just as it does behind home. The polling idiom lives once in `useVisiblePoll` (src/hooks/useVisiblePoll.ts), used by both pages. Reload plumbing was unified at the same time, and finished later that day (user-confirmed, after a quality audit found the three hooks wiring the reload effect three different ways): `useLoadProtocol` owns `reload()` **and the loud re-run it triggers** (since 2026-09-06 `reload()` bumps the token and re-runs the load itself; the mount/input-change effect keys on the load's inputs alone) — the token never leaves the hook, so no consumer can mis-wire it — and each data hook also exposes its load as a silent `refresh` callback, which is what the poll calls; a loud in-flight indicator keys on the protocol's `reloading` instead of the token. So a background poll never flips the pager's in-flight state or disables its buttons; the caller-owned `reloadKey` counter that the account page used to thread through its hooks is gone, and both Retry buttons go through `reload()`.
