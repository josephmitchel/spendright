---
characteristic: 'functional suitability'
---

# Summary

Three auditors reviewed the codebase against SNAPSHOT.md. The sync engine, category/card matching, API contract, data model, and UI behavior all track the snapshot's specific claims with high fidelity — including subtle edge cases (carried category selections, sign-flip clearing, retired-category display) verified line-by-line. Three genuine findings emerged, all in how sync outcomes and load state are surfaced to the user rather than in core data handling. This is the first audit of the era, so all findings are `[new]`.

# Major Concerns

None.

# Moderate Concerns

- `[new]` **"Last automatic sync" label is inaccurate after a manual sync.** `src/app/page.tsx:142-150`, `src/lib/sync-all.ts:73`, `src/lib/sync-status.ts`. `syncAllItems()` records `lastSync` unconditionally from both the hourly scheduler and the user-triggered `POST /api/sync` ("Sync all" button), but the home page renders the shared state as "Last automatic sync finished {date}" / "The last automatic sync failed: {error}" with no distinction. After a manual sync, the label misrepresents whether the unattended scheduler is actually running and healthy — the very thing the status line exists to convey. The UI asserts something the underlying data doesn't distinguish.

- `[new]` **`useSyncAll`'s "fully clean" check silently ignores account-refresh failures.** `src/app/useSyncAll.ts:32-36`, `src/lib/sync.ts:49-66`, `src/lib/sync-outcome.ts:35-67`. The snapshot says link notices "expire only when a manual 'Sync all' finishes fully clean." A failed `getAccounts` sets `accountRefreshFailed` → `items.error`, but `SyncItemResult` never surfaces that flag to the client, so the success gate (`!isSyncFailure && !result.skipped`) can't see it. A manual sync with zero skipped transactions but a failed account refresh is classified as fully clean: `syncSucceededAt` is set, the connect notice expires, and the "Sync complete…" status line never mentions the refresh failure — a partial success misreported as a clean run, contradicting documented intent.

# Minor Concerns

- `[new]` **Home page can transiently lose its "No institutions connected yet." message on a background poll hiccup.** `src/app/useHomeData.ts:32` (only `accounts` is sticky), `src/app/page.tsx:21-27`, `src/hooks/useLoadProtocol.ts:70-77`. With zero institutions connected, a transient failure of the 60-second `/api/items` poll flips `loaded.items` to false while `itemList` stays `[]`; `deriveView` falls through to `unresolved` (renders nothing) and the message silently disappears until the next successful poll. Asymmetric with `useAccountData`, which never regresses its view on a lone failed read. Self-heals, but the displayed view briefly stops reflecting known state.
