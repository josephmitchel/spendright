# Audit Summary — 09-08-2026-185731

First audit of the current snapshot era (the audits folder was empty), so every finding is `[new]` and the prior subtotal is zero by definition. 27 auditors ran (3 per ISO/IEC 25010:2023 characteristic); duplicate findings across auditors of the same characteristic were merged.

## Main takeaways

**Three characteristics came back completely clean — Reliability, Safety, and (near-clean) Security.** All three reliability auditors and all three safety auditors independently reported genuine zero-finding passes, each noting the engineering (bounded waits, crash supervision, kind-sign DB constraints, redaction, seed attestation) is unusually thorough for the project's stage and matches SNAPSHOT.md exactly. Security's only finding is a Minor supply-chain observation about the redaction safety net riding an unpinned transitive axios version.

**The headline finding is Compatibility's `[new]` Major: transaction dates silently shift by one day on any host with a positive UTC offset.** The pg driver returns `date` columns as local-timezone JS Dates while drizzle's string-mode column re-serializes them via `toISOString()` — empirically reproduced (Tokyo/Berlin off by one; NY/UTC correct). It's read-side-only, silent corruption of displayed dates, sort order, and the transactions API, and it is not blessed by the snapshot. A one-line type-parser override fixes it.

**The Moderate tier clusters around outcome reporting and unguarded volume, not core logic.** Two functional-suitability findings show sync outcomes being misreported to the user (the "Last automatic sync" label doesn't distinguish manual syncs; a "fully clean" sync can hide an account-refresh failure and wrongly expire a connect notice). Performance found the one capacity gap the chunked-upsert discipline missed (unbounded `inArray` on removed/carried ids). Compatibility found the session-mode Postgres requirement is fail-silent despite the snapshot naming it as a breaking hazard, and Interaction found removal errors are the one error surface not collocated with their trigger.

**Minor findings are consistency housekeeping**: prettier drift with no enforcement gate (all three maintainability auditors converged on it), the comment-only pool/concurrency invariant (two flexibility auditors), missing-value rendering and focus-management gaps in the removal/table UI, unenforced Node engines, no port-conflict fallback, formatter-instance caching, a transient empty-state blink, and three unused exports.

Since this is the era's baseline audit, everything above is newly surfaced; the prior-vs-new split becomes meaningful at the next run — any of these still present will carry `[prior]`.

## Score

| Severity | Count | Points |
| -------- | ----- | ------ |
| Major    | 1     | 5      |
| Moderate | 5     | 10     |
| Minor    | 11    | 11     |

**Score: 26 (prior: 0, new: 26)**
