---
name: structural-risk-acceptances
description: Three recurring maintainability audit findings are accepted as-is for this stage — the untested start.mjs supervisor and design-record meta-tooling fall under the project-wide tests deferral, and plaid.ts stays whole until the recorded 400-line trigger
tags: [scripts/start.mjs, src/lib/plaid.ts, scripts/check-record-tags.mjs, scripts/check-design-refs.mjs, "tests deferred"]
date: 2026-09-07
---

Confirmed 2026-09-07: three Moderate maintainability findings have recurred across audits without a recorded stance. The user's decision on each:

- **`scripts/start.mjs` (stateful, untested process supervisor)** and **the design-record meta-tooling** (`check-record-tags.mjs`, `check-design-refs.mjs` — custom text parsing with no tests of its own): both are covered by the project-wide deliberate tests deferral (2026-09-06). Their correctness rests on manual trace for now; when tests land, these two are priority targets precisely because their failure modes are silent.
- **`src/lib/plaid.ts` (multi-responsibility, 300+ lines):** the 400-line split trigger in [[plaid-module-seams]] stands — no early split. The trigger remains manually enforced (no `max-lines` lint rule), which is a known Minor gap, not an oversight.
- **The design-record corpus outgrowing the source tree** (records ≈ files) is accepted as the cost of the audit/record discipline itself; no cap or pruning policy for now.

Audits should treat re-observations of these three as prior/accepted rather than fresh gaps while this record stands.
