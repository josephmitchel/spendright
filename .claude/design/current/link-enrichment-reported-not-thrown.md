---
name: link-enrichment-reported-not-thrown
description: When the post-shell enrichment of a link fails (getItem/getAccounts/storeItem), the failure is recorded on items.error and returned as syncError instead of thrown — no unlabeled orphan rows
tags: [linkItem, storeItemShell, recordSyncFailure, src/lib/link.ts, getItem, retryOnce]
date: 2026-09-07
---

Confirmed 2026-09-07: the 2026-09-07 reliability audit found that [[token-stored-before-enrichment]] left a gap [[initial-sync-reported-not-thrown]] didn't cover — `storeItemShell` commits the item row before `getItem`/`getAccounts` run, so an enrichment failure propagated to a generic 500/502 while the row survived with no institution name, no accounts, and no `items.error`, appearing on the home page as a raw `itemId` with no explanation. The user chose report-don't-throw over rolling the shell back (rollback would discard an already-obtained access token and force a full relink). `linkItem` now catches enrichment failures, records them via `recordSyncFailure` (so the home page shows the error next to the item, with Fix connection for Plaid-shaped errors and Remove always available), and returns a `LinkResult` whose `syncError` carries the message — the same contract the initial-sync path already had. `getItem` also gained the [[transient-plaid-retry]] `retryOnce` wrapper its parallel sibling `getAccounts` already had, so a one-off blip no longer hard-fails a link that would have self-healed.

Update 2026-09-07: `LinkResult` (and `ExchangeResponse`) carry `setupFailed` so the client can tell an enrichment failure from a failed first sync — three audit rounds flagged that `PlaidLinkButton`'s hardcoded "Connected, but the first sync didn't finish:" prefix was factually wrong for this path, where no sync was ever attempted. The button now applies that prefix only when `setup_failed` is false; the enrichment message is already a complete sentence and renders verbatim.
