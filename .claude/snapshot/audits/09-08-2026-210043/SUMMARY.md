# Audit Summary — 09-08-2026-210043

First audit of the current snapshot era (the audits folder was cleared when the new snapshot was accepted), so there were no prior concerns to re-verify and every concern below is `status: new`. 27 auditors ran (3 per ISO/IEC 25010:2023 requirement).

## Main takeaways

The codebase came out of this audit unusually clean. Security (×3), safety (×3), flexibility (×3), and two of three auditors each for functional suitability, performance efficiency, compatibility, reliability, maintainability, and interaction capability reported zero findings — repeatedly noting that the implementation matches SNAPSHOT.md's documented design line-for-line and that the snapshot's "Intentionally absent / deferred" section already names and justifies everything that would otherwise be flagged.

Nine concerns were surfaced, none major:

**Moderate (4):**

- `misleading-sync-status-prefix-on-partial-success` — the post-link UI can claim "the first sync didn't finish" after a fully successful sync (prefix gated on the wrong flag).
- `inconsistent-plaid-retry-policy` — the documented "one bounded retry" policy covers only sync-engine Plaid calls; `createLinkToken`, `exchangePublicToken`, `getInstitutionById`, and `removeItem` get no retry, worst for `exchangePublicToken` where a transient failure discards a completed Link flow.
- `missing-live-region-for-outcome-states` — outcome states ("No transactions.", "Account not found…", etc.) render outside any live region, breaking the project's own screen-reader convention.
- `sync-status-missing-institution-attribution` — "Sync all" feedback attributes failures to institutions but leaves successful counts anonymous.

**Minor (5):**

- `category-pick-irreversibility-not-surfaced` — the UI gives no cue that a category pick can never be cleared.
- `plaid-error-shape-no-runtime-guard` — no startup canary for `plaidErrorBody`'s axios-shape extraction, unlike the parallel redaction path.
- `list-transactions-sequential-count` — row and count queries run sequentially instead of via `Promise.all` on the highest-frequency read path.
- `seed-cards-stray-backfill` — an unreachable, undocumented legacy backfill runs on every `seed:cards`.
- `category-write-state-implicit-contract` — `CategoryWriteState`'s required cross-file call ordering is undocumented.

Nothing was resolved this audit (nothing existed to resolve — first audit of the era).

## Score

Score: 13 (prior: 0, new: 13) — resolved this audit: 0

| Level     | Count      | Points |
| --------- | ---------- | ------ |
| Major     | 0          | 0      |
| Moderate  | 4          | 8      |
| Minor     | 5          | 5      |
| **Total** | **9 open** | **13** |
