---
characteristic: "safety"
---
# Summary

Four auditors assessed safety (ISO/IEC 25010:2023 §3.9). All four scoped it the same way: SpendRight moves no funds, so the applicable harm class is property — misleading the user into a bad financial decision via wrong/stale/unqualified figures, or destructive actions without adequate warning. All four verified the prior round's moderate findings are fixed in code (account detail page now joins and renders the owning item's error with an "updated" timestamp; whole-run scheduled-sync failures are recorded via `recordLastSync` and surfaced on the home page) and honored the recorded deferrals (`reward-caps-deferred.md`, `reward-aggregation-deferred.md`, `operator-is-developer.md`). Destructive paths were confirmed bounded (retire-not-delete, Plaid-revoke-before-local-delete, accurate `confirm()` on removal), amounts use `numeric` end-to-end, and category/sign invariants are enforced by a DB check constraint.

The strongest cross-agent consensus is on seed-rate plausibility (4/4, echoed by functional suitability) and the home page's missing freshness cue (2/4, one rating it moderate).

# Major Concerns

None. No path exists by which the app can move or lose funds.

# Moderate Concerns

- **Home page balance table gives no per-account staleness signal** (2/4 auditors; 1 moderate) — `src/app/page.tsx` (`AccountsTable`). The account detail page renders `updated {updatedAt}` next to every balance, but the home page — the primary at-a-glance view most likely to inform a spending decision — renders current/available/limit with no timestamp, even though `ApiAccount` already carries the field. The global "Last automatic sync finished" line and per-item error banner don't say which account's balance they cover, and a balance can be stale from an account-store failure that never sets `items.error` (`storeAccounts` logs and continues). A hazard-warning gap for exactly the screen that most needs one. Suggested: surface `updatedAt` per row/institution, or record staleness as an accepted risk.

- **Seeded reward-rate values are unbounded and unvalidated for plausibility** (4/4 auditors; 1 rated moderate) — `scripts/seed-cards.ts` (`assertSeedIsValid`, ~36-74). Structural validation (uniqueness, blankness) never checks that `rate` is non-negative or within a sane bound; a transposition typo (`60` for `6`) ships silently into `card_categories.rate`, renders unconditionally, and is snapshotted per-transaction as `reward_rate` — unqualified, authoritative guidance for the app's core purpose. Distinct from the accepted cap/tier-modeling deferral: this is data-entry plausibility of the stored number, covered by no design record. (Also flagged independently by three functional-suitability auditors.)

# Minor Concerns

- **All error/warning severities render with identical visual weight** (3/4 auditors) — `src/components/ErrorNotice.tsx`: a transient blip, a recoverable skipped-sync notice, an irreversible post-`MAX_SKIPPED_SYNCS` cursor drop, and a systemic config failure all render as the same `role="alert"` paragraph. Nothing cues which warnings need action before the user relies on the figures.

- **Destructive seed reconcile has no confirmation, dry-run, or target echo** (3/4 auditors) — `scripts/seed-cards.ts` `main()`/`retireMissing`: the retire pass runs immediately against whatever `DATABASE_URL` resolves to, with no printed target or prompt. Bounded by retire-not-delete semantics (`seed-reconcile-is-destructive.md`), but a misdirected env or truncated seed file silently retires the live catalog.

- **`kindForAmount` routes `NaN` silently into ordinary spend** (3/4 auditors) — `src/lib/category-kinds.ts:6-9`. The inline comment calls it intentional, but the cited record (`category-kind-sign-rule.md`) doesn't describe the NaN behavior, and no mechanism warns if a malformed amount actually occurs — bad input silently treated as good in reward accounting.

- **`matchCard` has no guard against a semantically wrong seed mapping** (2/4 auditors) — `src/lib/cards.ts:8-18`: a wrong-but-unique `plaidAccountNames` entry silently attaches an account's transactions and reward reporting to the wrong card indefinitely; no cross-check (e.g. Plaid account type/subtype) exists.

- **No duplicate-institution guard at link time** (3/4 auditors) — relinking the same institution creates a second, independently-syncing item row with no detection or warning. Double-counting is unlikely (Plaid-ID-keyed upserts) but the condition is silent rather than impossible.

- **Staleness is a raw timestamp, not a hazard threshold** (1 auditor) — both surfaces that show a timestamp leave the "is this too old?" judgment to the user; nothing distinguishes "fresh" from "frozen since the process died" when the gap exceeds the scheduler's own hourly cadence. (Interacts with the reliability report's process-crash finding: a dead process freezes both timestamps silently.)
