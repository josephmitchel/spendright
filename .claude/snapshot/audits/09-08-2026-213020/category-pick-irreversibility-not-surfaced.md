---
characteristics: [interaction-capability]
level: minor
status: resolved
first-seen: 09-08-2026-210043
locations:
  - src/app/accounts/[accountId]/TransactionTable.tsx:47
---

# Category pick irreversibility is not surfaced in the UI

Nothing in the UI communicated that a category, once set, can only be replaced and never cleared — the user had no in-context cue that the pick is a one-way commitment.

Verified fixed by all three interaction-capability auditors: `CategorySelect` (`src/app/accounts/[accountId]/TransactionTable.tsx:47-49`) now carries `title="Once set, a category can be changed but never cleared"` alongside its `aria-label`, with a comment noting the title is exposed as the accessible description — the warning reaches both hover and screen-reader users at the point of interaction.
