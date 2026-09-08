---
name: accepted-audit-risks
description: Recurring audit findings the user has accepted as-is for this stage — the untested start.mjs supervisor and design-record meta-tooling (under the tests deferral), plaid.ts staying whole until its 400-line trigger, and the dev-only esbuild/drizzle-kit npm-audit chain; audits treat re-observations as prior/accepted, not fresh gaps
tags: [scripts/start.mjs, src/lib/plaid.ts, scripts/check-record-tags.mjs, scripts/check-design-refs.mjs, "tests deferred", npm audit, drizzle-kit, esbuild advisory chain, GHSA 67mh-4wv8-2f99, dev dependencies]
date: 2026-09-05
---

## Structural risk acceptances (confirmed 2026-09-07)

Three Moderate maintainability findings recurred across audits without a recorded stance. The user's decision on each:

- **`scripts/start.mjs` (stateful, untested process supervisor)** and **the design-record meta-tooling** (`check-record-tags.mjs`, `check-design-refs.mjs` — custom text parsing with no tests of its own): both are covered by the project-wide deliberate tests deferral (2026-09-06). Their correctness rests on manual trace for now; when tests land, these two are priority targets precisely because their failure modes are silent.
- **`src/lib/plaid.ts` (multi-responsibility, 300+ lines):** the 400-line split trigger in [[plaid-module-seams]] stands — no early split. The trigger remains manually enforced (no `max-lines` lint rule), which is a known Minor gap, not an oversight.
- **The design-record corpus outgrowing the source tree**: originally accepted with no cap or pruning policy; superseded 2026-09-07 by [[design-corpus-compaction]], which sets the extend-don't-add default and the `/compact-design` consolidation path.

Audits should treat re-observations of these as prior/accepted rather than fresh gaps while this record stands.

## Dev-dependency advisories accepted (accepted 2026-09-05)

Accepted 2026-09-05 (raised by two security-audit passes, both recommending acceptance): `npm audit` reports 4 moderate findings, all one chain — `drizzle-kit → @esbuild-kit/esm-loader → @esbuild-kit/core-utils → esbuild <= 0.24.2` (GHSA-67mh-4wv8-2f99, the esbuild dev-server CORS issue). It is dev tooling only: drizzle-kit never runs an esbuild dev server, and nothing in the chain is reachable from the app runtime (`npm audit --omit=dev` is clean). The only remediation npm offers is a breaking downgrade to `drizzle-kit@0.18.1`, which is worse than the exposure. Revisit when drizzle-kit drops the `@esbuild-kit` dependency; do not re-raise this chain in future audits while these facts hold.
