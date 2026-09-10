---
characteristics: [interaction-capability]
level: moderate
status: new
first-seen: 09-08-2026-210043
locations:
  - src/app/useSyncAll.ts:24
  - src/lib/sync.ts:18
  - src/lib/sync-all.ts:12
---

# "Sync all" status feedback loses institution identity for successful results

In `useSyncAll.ts`, the per-item message is built as `isSyncFailure(result) ? "${institutionName}: ${error}" : "+${added} added${…}"` — the failure branch is prefixed with the institution name (because `SyncItemFailure` carries `institutionName`), but the success branch is not, because `SyncItemResult` (`sync.ts`) has no `institutionName` field at all, only `itemId`. With more than one linked institution (which the home page already renders and supports via `itemList.map`), a "Sync complete." line reads like `"+3 added, +5 added, Chase: rate limited"` — the successful counts are anonymous while only the failure is attributable to a bank. A user with multiple connected institutions cannot tell which bank got which count, undermining the self-descriptiveness of the very feedback the "Sync all" button produces. Suggested direction: carry `institutionName` through `SyncItemResult` (mirroring `SyncItemFailure`) and prefix every per-item message with it, not just failures.
