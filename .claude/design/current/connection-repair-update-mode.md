---
name: connection-repair-update-mode
description: A broken bank connection is repaired via Plaid Link update mode instead of remove-and-relink
tags:
  [
    createLinkToken,
    createRepairLinkToken,
    RepairConnectionButton,
    src/app/api/items/[itemId]/link-token/route.ts,
    isPlaidItemError,
  ]
date: 2026-09-07
---

Before this (2026-09-07, user-confirmed), an item whose sync failed permanently (e.g. `ITEM_LOGIN_REQUIRED`) had no repair path: "Connect a bank" creates an unrelated new item and "Remove" cascade-deletes the item's accounts and transactions. Plaid Link **update mode** re-authenticates the existing item, keeping its access token, accounts, and history.

Mechanics: `createLinkToken` takes an optional access token — when present the link token is minted with `access_token` and without `products`, which is what puts Link in update mode. `POST /api/items/[itemId]/link-token` ([[thin-routes-domain-in-lib]]: flow in `createRepairLinkToken` in `src/lib/link.ts`) decrypts the stored token and mints such a token. The home page shows a per-item "Fix connection" button (`RepairConnectionButton`).

Two user-confirmed decisions:

- **Visibility**: the button appears only when `items.error` is a Plaid-shaped body (`isPlaidItemError`). App-internal `{ message }` notices (skipped syncs, failed account refresh) are not fixable by re-auth and get no button.
- **Post-repair**: update-mode success returns a public token that needs no exchange — the stored access token stays valid. The client immediately triggers the existing sync action to prove the connection works; a clean sync clears `items.error` in `recordSyncOutcome`. Implementation note: the client reuses the home page's sync-all action rather than a new per-item sync endpoint — with one user and few items ([[single-user-localhost-no-auth]]) syncing the healthy items too is harmless, and it reuses the existing status/notice pipeline ([[bounded-cursor-hold]], [[link-flow]]).

If the item is beyond repair (e.g. deleted at Plaid, `ITEM_NOT_FOUND`), minting the update-mode token fails and the error surfaces inline next to the button; "Remove" remains the way out.
