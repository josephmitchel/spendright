---
name: accounts-refreshed-per-sync
description: Every sync re-upserts the item's accounts from Plaid, each in its own database transaction, before the transaction pull; a failing account costs only its own rows
tags: [upsertAccount, src/lib/accounts.ts, syncItem, getAccounts, db.transaction]
date: 2026-09-04
---

A sync first refreshes each account row (name, balances, card match per [[rematch-on-every-sync]]) and only then pulls transactions. Each account's upsert is wrapped in its own database transaction so its row locks stay short and one failing account neither rolls back its siblings nor the cursor. A failure is logged and skipped; that account's transactions are then handled by [[bounded-cursor-hold]]. The accounts call itself is best-effort: if it fails, the sync proceeds against the accounts already stored. Replaces [[whole-sync-single-transaction]].
