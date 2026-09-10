---
characteristics: [compatibility]
level: minor
status: new
first-seen: 09-08-2026-222047
locations:
  - package.json:36
  - src/hooks/usePlaidLinkOpen.ts:1
---

# react-plaid-link is the last caret-ranged runtime dependency on an interop path

Every other direct runtime dependency — `axios`, `drizzle-orm`, `next`, `pg`,
`plaid`, `react`, `react-dom` — is exact-pinned, a posture established by the
resolved `dep-shape-assumptions-lack-canaries` concern: a caret range lets a
routine lockfile refresh silently change behavior the code depends on, with no
test suite (deferred project-wide) to catch a regression. `react-plaid-link`
remains at `^4.2.0`, and it is exactly the layer mediating the app's
interoperability with the externally hosted Plaid Link script: it owns the
`usePlaidLink` handshake (`token`/`onSuccess`/`onLoad`) that the entire
link/re-link flow is built on. A minor/patch bump — invisible unless someone
diffs the lockfile — could change that handshake's timing or error shape.

One of the three compatibility auditors flagged this; another explicitly
considered and dismissed it, noting `usePlaidLinkOpen.ts` uses only the
documented public hook API with no `Verified-on:` assumption, so it doesn't
fit the undocumented-behavior pattern the prior fix targeted. Recorded as
minor despite the dissent because the project's pinning posture is broader
than that pattern — `react`/`next`/`axios` are pinned while used through
documented APIs too — and the lone remaining caret is at minimum an
inconsistency in that posture.

Suggested direction: pin `react-plaid-link` to its exact resolved version
(`4.2.0`) in `package.json`, matching the treatment of every other runtime
dependency. (`server-only` stays caret-ranged: zero-behavior build-time poison
package, negligible surface.)
