---
characteristics: [interaction-capability]
level: moderate
status: new
first-seen: 09-08-2026-222047
locations:
  - src/app/PlaidLinkButton.tsx:73
  - src/app/RepairConnectionButton.tsx:45
  - src/app/page.tsx:92
  - src/app/page.tsx:159
  - src/app/accounts/[accountId]/page.tsx:85
  - src/app/accounts/[accountId]/TransactionTable.tsx:159
  - src/components/ErrorNotice.tsx:20
---

# Disabling a focused control silently drops keyboard focus to `<body>`

Every pending/stale state in the app disables a native control in place:
"Connect a bank", "Fix connection", "Remove", "Sync all", "Retry", the pager's
Previous/Next buttons, and the category `<select>` (via
`categoriesMayBeStale`). When the user's focus is sitting on such an element —
a click focuses a button in most browsers, and a keyboard user tabs to it
before activating — the instant it becomes `disabled` the browser removes it
from the focus order and moves focus to `<body>`. Nothing restores it: the
only explicit focus-management call in the client codebase is
`headingRef.current?.focus()` at `src/app/page.tsx:133`, which handles the one
case the code already reasoned about (item removal unmounting its section).

A keyboard-only user who presses "Next" on the pager, clicks "Sync all", or
clicks "Retry" gets focus silently ejected to the top of the document the
instant the action starts, and it never returns when the control re-enables —
they must re-tab from the top on every core interaction. The category
`<select>` case is worse: `categoriesMayBeStale` can flip true from a
*background poll* failure, so a keyboard user merely resting focus on a select
can have it yanked away by a 60s poll they didn't initiate.

The app is otherwise unusually careful about non-visual interaction (live
regions, `aria-describedby` on disabled pickers, the one deliberate focus
restore), which makes this an addressable gap, not a styling omission —
nothing in SNAPSHOT's "Intentionally absent / deferred" covers focus
management, and this is DOM behavior, not CSS.

Suggested direction: apply the pattern already used for item removal — capture
a ref to the triggering control (or a stable nearby landmark, e.g. the pager's
status text) before the pending state disables it, and restore focus once the
action settles. For the pager and category select, alternatively keep the
control focusable while an operation is merely in flight (the existing
`role="status"` text already announces pending) and only truly disable when a
write would be actively unsafe.
