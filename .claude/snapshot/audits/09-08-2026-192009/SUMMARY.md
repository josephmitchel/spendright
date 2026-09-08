# Audit Summary — 09-08-2026 19:20

Third audit of this snapshot era (prior: `09-08-2026-185731`; a second folder from an interrupted run contained no reports). 27 auditors ran — 3 per ISO/IEC 25010:2023 characteristic.

## Main takeaways

**Every Major and Moderate concern from the prior audit is resolved and verified.** Commit `fbf2912` ("major and moderate fixes") was independently confirmed by multiple auditors per characteristic to correctly fix all six substantive prior findings:

- Functional suitability: the manual-vs-automatic sync label (`SyncTrigger` plumbing) and `useSyncAll`'s success gate now accounting for `accountRefreshFailed` — both Moderates resolved.
- Compatibility: the Major timezone date-shift bug (`setTypeParser(1082, ...)`) and the Moderate silent transaction-pooling incompatibility (`assertSessionModeConnection()`) — both resolved.
- Performance efficiency: the Moderate unbounded-`inArray` bind-parameter risk — resolved via `chunkArray`.
- Interaction capability: the Moderate non-collocated institution-removal errors — resolved via per-key error maps rendered inline.

Reliability and safety remain clean passes with zero findings, and the safety auditors specifically concluded `fbf2912` strengthened the posture (fail-closed session-mode check, chunking without lost atomicity, date-accuracy fix).

**Lingering prior concerns — all Minor (11 points):** uncached `Intl.NumberFormat` in `formatMoney` (performance); Node engine version unenforced and no port-conflict fallback in `start.mjs` (compatibility); removal focus/confirmation gap, inconsistent null-cell rendering, and non-bookmarkable pagination (interaction); the transient loss of "No institutions connected yet." on a poll hiccup (functional); the unpinned transitive axios riding under the secret-redaction safety net (security); unenforced Prettier drift — now grown to 33 files — and two unused exports (maintainability); the comment-only pool/concurrency invariant (flexibility). None were touched by `fbf2912`, which was deliberately scoped to Major/Moderate items.

**Newly surfaced — all Minor (5 points):** the non-sticky-loaded-flag pattern recurring on the account detail page's not-found/unsupported views (functional, found by 2 of 3 auditors — same defect class as the open home-page finding, worth fixing together); undifferentiated accessible names on repeated per-institution Remove/Fix-connection buttons (interaction); the duplicated 500-row chunk constant `ID_CHUNK_SIZE`/`UPSERT_CHUNK_SIZE` introduced by `fbf2912` itself (found independently by maintainability and flexibility auditors — counted once in each characteristic's report, so it contributes 2 of the 5 new points as a single underlying issue); and Plaid Link's hardcoded `language: 'en'` against the otherwise-configurable country-codes surface (flexibility).

The clear pattern in the new findings: two of the four are the codebase's own established conventions not being applied at one more site (sticky keys, shared constants) — cheap, mechanical fixes.

## Score

**Score: 16 (prior: 11, new: 5)**

| Characteristic         | Major | Moderate | Minor              | Points |
| ---------------------- | ----- | -------- | ------------------ | ------ |
| Functional Suitability | 0     | 0        | 2 (1 prior, 1 new) | 2      |
| Performance Efficiency | 0     | 0        | 1 (prior)          | 1      |
| Compatibility          | 0     | 0        | 2 (prior)          | 2      |
| Interaction Capability | 0     | 0        | 4 (3 prior, 1 new) | 4      |
| Reliability            | 0     | 0        | 0                  | 0      |
| Security               | 0     | 0        | 1 (prior)          | 1      |
| Maintainability        | 0     | 0        | 3 (2 prior, 1 new) | 3      |
| Flexibility            | 0     | 0        | 3 (1 prior, 2 new) | 3      |
| Safety                 | 0     | 0        | 0                  | 0      |
| **Total**              | **0** | **0**    | **16**             | **16** |

The prior audit's Major (5) and five Moderates (10) — 15 points of substantive concern — are all gone; what remains is entirely Minor-severity housekeeping.
