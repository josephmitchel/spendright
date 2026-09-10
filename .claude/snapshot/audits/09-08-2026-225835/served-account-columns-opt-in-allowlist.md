---
characteristics: [maintainability]
level: minor
status: resolved
first-seen: 09-08-2026-223901
locations:
  - src/lib/accounts.ts:11
  - src/lib/items.ts:15
  - src/lib/transactions.ts:5
---

# servedAccountColumns uses an opt-in allowlist, inverting the codebase's own served-columns convention

`src/lib/accounts.ts` hand-listed all 16 served columns one by one, inverting
the deliberate destructure-out convention that `items.ts` and
`transactions.ts` follow (`getTableColumns(table)` with sensitive fields
destructured out, so future columns are served by default).

**Verified fixed** by all three maintainability auditors:
`src/lib/accounts.ts:9-11` now reads `export const servedAccountColumns =
getTableColumns(accounts);` with a comment noting that a future sensitive
column gets destructured out there, same as items.ts/transactions.ts. All
three served-row definitions now follow the identical convention SNAPSHOT
describes.
