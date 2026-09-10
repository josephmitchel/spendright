---
characteristics: [interaction-capability]
level: moderate
status: resolved
first-seen: 09-08-2026-210043
locations:
  - src/app/useSyncAll.ts:26
  - src/lib/sync.ts:20
---

# "Sync all" status feedback loses institution identity for successful results

Per-item "Sync all" messages prefixed only failures with the institution name; successful counts were anonymous, so a multi-institution "Sync complete." line couldn't attribute counts to banks.

Verified fixed by all three interaction-capability auditors: `SyncItemResult` (`src/lib/sync.ts:20`) now carries `institutionName: string | null`, populated at `src/lib/sync.ts:115-116`, and `src/app/useSyncAll.ts:26` prefixes every per-item message — success and failure alike — with `${result.institutionName ?? result.itemId}:`.
