---
characteristics: [compatibility]
level: minor
status: resolved
first-seen: 09-08-2026-222047
locations:
  - package.json:36
---

# react-plaid-link is the last caret-ranged runtime dependency on an interop path

`react-plaid-link` was the only runtime dependency still caret-ranged
(`^4.2.0`) while every other runtime dependency was exact-pinned — and it is
exactly the layer mediating the Plaid Link handshake.

**Verified fixed** by all three compatibility auditors independently:
`package.json:36` now reads `"react-plaid-link": "4.2.0"` — exact-pinned, with
`package-lock.json` updated to match and `npm ls` confirming the installed
tree resolves to exactly 4.2.0. The same change also swept the other
remaining caret-ranged runtime deps (`drizzle-orm`, `pg`, `plaid`) to exact
pins, so every runtime dependency is now exact-pinned; `server-only` (the
zero-behavior build-time poison package) remains the sole deliberate
exception, as the original concern's suggested direction allowed.
