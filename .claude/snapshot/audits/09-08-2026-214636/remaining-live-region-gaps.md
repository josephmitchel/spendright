---
characteristics: [interaction-capability]
level: moderate
status: resolved
first-seen: 09-08-2026-213020
locations:
  - src/app/accounts/[accountId]/page.tsx:186
  - src/app/accounts/[accountId]/page.tsx:82
---

# Two dynamic notices still render outside the project's live-region convention

The stale-categories notice and the pager's "Showing X–Y of Z" range were the two
remaining spots where dynamic state changed without a live-region announcement,
breaking the SNAPSHOT convention ("status text lives inside always-mounted
`role="status"` wrappers whose content toggles").

**Verified fixed** by all three interaction-capability auditors independently
(plus safety cross-checks):

- The stale-categories notice now lives in an always-mounted
  `<p role="status" id={CATEGORY_STALE_NOTICE_ID}>` whose text toggles with
  `categoriesMayBeStale` (`src/app/accounts/[accountId]/page.tsx:186`), and the
  disabled pickers point at it via `aria-describedby`
  (`TransactionTable.tsx:49`), so both the fresh→stale and stale→fresh
  transitions announce and a disabled select explains itself.
- The pager range "Showing {rangeStart}–{rangeEnd} of {total}" now sits inside
  an always-mounted `<span role="status">`
  (`src/app/accounts/[accountId]/page.tsx:82-84`), so a page turn announces the
  resulting range, not just the transient "Loading…".

Both fixes match the originally suggested direction exactly.
