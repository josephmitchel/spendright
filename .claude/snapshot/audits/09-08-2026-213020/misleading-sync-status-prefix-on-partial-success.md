---
characteristics: [functional-suitability]
level: moderate
status: resolved
first-seen: 09-08-2026-210043
locations:
  - src/app/PlaidLinkButton.tsx:47
  - src/lib/link.ts:179
---

# Misleading "first sync didn't finish" prefix on successful post-link syncs

The post-link status notice gated its "Connected, but the first sync didn't finish: " prefix on `!data.setup_failed` alone, so a fully successful sync whose notices merely described held rows or an unrelated account-store failure was mislabeled as an unfinished sync.

Verified fixed by all three functional-suitability auditors: `src/app/PlaidLinkButton.tsx:47-48` now gates the prefix on `data.sync_error && !data.setup_failed` — exactly the suggested fix. `src/lib/link.ts` confirms `syncError` is null whenever `runInitialSync` succeeds, independent of `skipped`/`accountErrors`, so the false prefix can no longer appear.
