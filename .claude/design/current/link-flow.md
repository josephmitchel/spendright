---
name: link-flow
description: The link/onboarding flow's failure-handling decisions — token persisted before enrichment, enrichment and first-sync failures reported on items.error (never thrown as a failed link), the "Connected, but…" notice expiring on a clean Sync all, re-link never nulling stored institution metadata, and the first sync running inline in the link request
tags:
  [
    src/lib/link.ts,
    linkItem,
    storeItemShell,
    storeItem,
    exchangePublicToken,
    items.access_token,
    runInitialSync,
    recordSyncFailure,
    items.error,
    sync_error,
    account_errors,
    PlaidLinkButton,
    getItem,
    retryOnce,
    syncSucceededAt,
    noticeIsCurrent,
    home page syncAll,
    institutionUpdate,
    getInstitutionById,
    items.institution_logo,
    src/app/api/exchange/route.ts,
    syncItem,
    notReadyRetries,
  ]
date: 2026-09-04
---

## Token stored before enrichment (confirmed 2026-09-06)

The moment `itemPublicTokenExchange` answers, the Item is live at Plaid. `linkItem` therefore upserts a minimal item row (item id + encrypted token) before calling `itemGet`/`accountsGet`: if any enrichment call then fails, the link request errors but the item is visible locally — it can be synced later or removed — instead of leaving a live Plaid Item behind a discarded token that `DELETE /api/items/[itemId]` can never reach. The full metadata upsert (below) follows on the happy path, re-writing the ciphertext the shell returned verbatim — the token is encrypted exactly once per link, so the two upserts cannot drift on that column (2026-09-06). The enrichment reads themselves (`itemGet`, `accountsGet`) run in parallel: independent, and the link request is the latency-sensitive one. Confirmed 2026-09-06 after a quality audit flagged the orphaning gap.

## Initial sync reported, not thrown (decided 2026-09-04)

Once the item and its accounts are committed the institution is connected, so a failure after that must not read as a failed link. The link flow (`runInitialSync`/`recordSyncFailure`, in `src/lib/link.ts` behind `POST /api/exchange`) catches the sync error, writes it to `items.error`, and answers 200 with `sync_error` and `account_errors`. The home page renders the item error under the institution and the link button shows a "Connected, but…" notice.

## Link enrichment reported, not thrown (confirmed 2026-09-07)

The 2026-09-07 reliability audit found that the token-stored-before-enrichment rule left a gap the initial-sync rule didn't cover — `storeItemShell` commits the item row before `getItem`/`getAccounts` run, so an enrichment failure propagated to a generic 500/502 while the row survived with no institution name, no accounts, and no `items.error`, appearing on the home page as a raw `itemId` with no explanation. The user chose report-don't-throw over rolling the shell back (rollback would discard an already-obtained access token and force a full relink). `linkItem` now catches enrichment failures, records them via `recordSyncFailure` (so the home page shows the error next to the item, with Fix connection for Plaid-shaped errors and Remove always available), and returns a `LinkResult` whose `syncError` carries the message — the same contract the initial-sync path already had. `getItem` also gained the [[transient-plaid-retry]] `retryOnce` wrapper its parallel sibling `getAccounts` already had, so a one-off blip no longer hard-fails a link that would have self-healed.

Update 2026-09-07: `LinkResult` (and `ExchangeResponse`) carry `setupFailed` so the client can tell an enrichment failure from a failed first sync — three audit rounds flagged that `PlaidLinkButton`'s hardcoded "Connected, but the first sync didn't finish:" prefix was factually wrong for this path, where no sync was ever attempted. The button now applies that prefix only when `setup_failed` is false; the enrichment message is already a complete sentence and renders verbatim.

## Link notice expires on clean sync (decided 2026-09-04)

The connect-time notice from the initial-sync rule above is timestamped. The home page (`src/app/page.tsx`) records `syncSucceededAt` when a "Sync all" finishes with every item error-free and nothing skipped or dropped, and `PlaidLinkButton` treats any notice raised before that time as stale and hides it. A partial or failed sync never expires the notice. Deliberately unchanged by [[home-reflects-background-sync]]: a background sync does not expire the connect-time notice — expiry stays keyed to a manual "Sync all".

## Re-link preserves institution metadata (decided 2026-09-04)

`institutionsGetById` may fail and is not fatal. On the conflict-update path the logo, colour, name and id are written only when a value was actually obtained. A read that failed is not evidence of what it would have returned. Same principle as [[partial-load-rendering]].

## Inline initial sync (decided 2026-09-04)

Initial sync pulls a few days of history at most, so it runs inline in `POST /api/exchange` (the flow itself lives in `src/lib/link.ts` `linkItem` since 2026-09-06 — [[thin-routes-domain-in-lib]]) with a capped not-ready poll (3 retries, about 6s). A background job the client polls is the eventual fix for hosts with request timeouts, and is deliberately not built while the app runs on one machine. See [[single-user-localhost-no-auth]]. The inline sync is serialized against any concurrent scheduled or manual sync of the same item by `syncItem`'s per-item lock in-process ([[scheduled-sync]], 2026-09-06), plus the cross-process advisory lock ([[cross-process-sync-lock]], 2026-09-07) — it takes no part in the sync-all single-flight guard and does not need to.
