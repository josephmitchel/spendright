---
characteristics: [interaction-capability]
level: moderate
status: resolved
first-seen: 09-08-2026-222047
locations:
  - src/components/GuardedButton.tsx:5
  - src/app/accounts/[accountId]/TransactionTable.tsx:36
  - src/app/PlaidLinkButton.tsx:74
  - src/app/RepairConnectionButton.tsx:44
  - src/app/page.tsx:91
  - src/app/page.tsx:160
  - src/app/accounts/[accountId]/page.tsx:86
  - src/components/ErrorNotice.tsx:22
---

# Disabling a focused control silently drops keyboard focus to `<body>`

Every pending/stale state disabled a native control in place, which removes it
from the focus order and ejects keyboard focus to `<body>` with no restoration
— across the Connect/Fix/Remove/Sync-all/Retry buttons, the pager, and the
category `<select>` (which a background poll could disable out from under a
resting focus).

**Verified fixed** by all three interaction-capability auditors independently:
a new shared `src/components/GuardedButton.tsx` replaces native `disabled`
with `aria-disabled` plus a guarded `onClick` no-op, keeping controls
focusable at all times — its prop type is `Omit<..., 'disabled'>`, so callers
structurally cannot reintroduce the attribute. Every site named in the
original finding now renders through it, and the category `<select>` applies
the same `aria-disabled` pattern directly with an inline comment naming the
background-poll scenario. A `grep` for native `disabled` across the client
tree finds only inert `<option>` placeholders. This is a systemic fix via one
shared primitive, matching the finding's suggested direction.
