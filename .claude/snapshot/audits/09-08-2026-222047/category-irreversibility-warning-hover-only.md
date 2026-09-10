---
characteristics: [interaction-capability]
level: minor
status: resolved
first-seen: 09-08-2026-214636
locations:
  - src/app/accounts/[accountId]/TransactionTable.tsx:114
  - src/app/accounts/[accountId]/TransactionTable.tsx:47
---

# Category-pick irreversibility warning reaches only hover and screen readers

The "once set, never cleared" warning was delivered exclusively through the
native `title` attribute, so touch-only users (no hover state) and sighted
keyboard-only users (no `title` tooltip on focus in current browsers) could
make the irreversible pick with zero in-context warning.

**Verified fixed** by all three interaction-capability auditors independently,
and spot-checked by the synthesizer: `TransactionTable.tsx:114` now renders a
permanently visible `<p>Once set, a category can be changed but never
cleared.</p>` directly above the transaction table — plain text, no
hover/focus dependency, reaching every interaction mode. The `title` attribute
at line 47 remains as a supplementary per-select cue. This matches the
originally suggested direction exactly.
