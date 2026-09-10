---
characteristics: [interaction-capability]
level: moderate
status: resolved
first-seen: 09-08-2026-210043
locations:
  - src/app/page.tsx:175
  - src/app/page.tsx:191
  - src/app/accounts/[accountId]/page.tsx:159
---

# Terminal/outcome view states render outside any live region

Outcome states ("No institutions connected yet.", "Accounts couldn't be loaded — use Retry above.", "Account not found…", "Card not supported…", "No transactions.") rendered as plain conditionally-mounted `<p>` elements with no live-region role, so a screen-reader user heard "Loading…" resolve to silence.

Verified fixed by all three interaction-capability auditors: "No institutions connected yet." now lives inside an always-mounted `<p role="status">` (`src/app/page.tsx:175-178`); "Accounts couldn't be loaded — use Retry above." renders with `role="alert"` (`src/app/page.tsx:191`); and "Account not found…", "Card not supported…", and "No transactions." all live inside a single always-mounted `<p role="status">` wrapper (`src/app/accounts/[accountId]/page.tsx:159-175`), with a comment documenting that the wrapper must stay mounted. All five originally-cited messages now follow the project convention.
