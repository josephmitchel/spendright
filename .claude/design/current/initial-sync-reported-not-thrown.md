---
name: initial-sync-reported-not-thrown
description: A failed first sync or a failed account store is reported on the item row and in the link response; the link itself returns 200
tags: [src/app/api/exchange/route.ts, items.error, sync_error, account_errors, PlaidLinkButton]
date: 2026-09-04
---

Once the item and its accounts are committed the institution is connected, so a failure after that must not read as a failed link. `/api/exchange` catches the sync error, writes it to `items.error`, and answers 200 with `sync_error` and `account_errors`. The home page renders the item error under the institution and the link button shows a "Connected, but…" notice.
