---
name: bounded-cursor-hold
description: Transactions for an account with no row are skipped and the cursor is held back so Plaid re-offers them; the fifth consecutive skipped sync advances the cursor and drops the batch
tags: [syncItem, recordSyncOutcome, MAX_SKIPPED_SYNCS, skippedItemErrorMessage, skippedSyncNotice, items.skipped_syncs, items.cursor, items.error, src/lib/sync.ts, src/lib/sync-messages.ts]
date: 2026-09-04
---

A transaction whose account_id exists nowhere in `accounts` would fail the FK and abort the whole sync, wedging the item forever. Instead it is skipped (not inserted, counted, logged), the rest of the batch commits, and the cursor is not advanced so the next sync replays the same batch, by which time [[accounts-refreshed-per-sync]] has usually stored the account. The hold is capped at `MAX_SKIPPED_SYNCS` (5) consecutive skipped syncs: the cursor is held back on the first four, and the fifth advances it and drops those rows for good, because an unbounded hold would block everything after them. `items.error` is written on the first skip and reads "held, N of 5" or "dropped" so the state is visible on the home page. The budget and every user-facing rendering of it (the stored item error, the sync-all status line, the connect-time notice) live in `src/lib/sync-messages.ts` so the policy cannot drift between surfaces. Replaces [[indefinite-cursor-hold]].
