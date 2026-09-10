---
characteristics: [maintainability]
level: minor
status: new
first-seen: 09-08-2026-223901
locations:
  - src/lib/accounts.ts:11
  - src/lib/items.ts:15
  - src/lib/transactions.ts:5
---

# servedAccountColumns uses an opt-in allowlist, inverting the codebase's own served-columns convention

SNAPSHOT states the served-columns rule as deliberate architecture: "new
columns reach clients by default while those [access tokens, raw Plaid
payload] never do (deliberate destructure convention)." `src/lib/items.ts`
and `src/lib/transactions.ts` follow it exactly — `getTableColumns(table)`
with the sensitive fields destructured *out*, so any future column is served
automatically unless explicitly excluded. `src/lib/accounts.ts:11-28` instead
hand-lists all 16 columns it serves, one by one (`satisfies
Partial<typeof accountColumns>`).

This is the inverse convention: a column added to `accounts` in `schema.ts`
will *not* reach the client until someone remembers to also add it here,
and the failure mode is a silent omission — no compile error, no runtime
error, nothing lint can catch. There is no live bug today (every existing
column happens to be listed), but the SNAPSHOT's stated invariant is not
actually true for one of the three served-row definitions.

Suggested direction: change `servedAccountColumns` to the same
destructure-omit shape as the other two (currently nothing needs excluding
from `accounts`, so `getTableColumns(accounts)` directly, or an empty-omit
destructure), so all three served-row definitions follow one pattern and the
documented invariant holds everywhere it claims to.
