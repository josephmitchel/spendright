---
name: home-reflects-background-sync
description: HomeClient re-reads /api/items and /api/accounts once a minute while the tab is visible and on return to it, so an hourly scheduled sync shows up without a reload; the connect-notice expiry stays keyed to a manual Sync all
tags: [HomeClient, src/components/HomeClient.tsx, refresh, visibilitychange, scheduled sync, polling]
date: 2026-09-05
---

Confirmed by the user 2026-09-05 (raised by the design audit after [[scheduled-sync]] landed): the home page must reflect a background scheduled sync — which mutates `items.error` and balances behind an already-open page — without a reload. Mechanism: `HomeClient` polls its existing `refresh()` (items + accounts) every 60 seconds while the tab is visible, and refreshes immediately when the tab becomes visible again; both are skipped while hidden. Polling was chosen over SSE/websockets — the payloads are two small loopback reads, and the staleness bound (≤1 minute against an hourly sync) doesn't justify a push channel. The existing generation counter makes a superseded poll write nothing ([[superseded-loads-write-nothing]]), so polling can never clobber a fresher read. Deliberately unchanged: [[link-notice-expires-on-clean-sync]] stays keyed to a manual "Sync all" — a background sync does not expire the connect-time notice, and only the home page polls (the account/transactions pages keep their load-on-mount behavior).
