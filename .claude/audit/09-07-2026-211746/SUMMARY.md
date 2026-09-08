# Audit Summary — 09-07-2026-211746

36 auditors (4 per characteristic × 9 characteristics) ran against a tree that finally moved: commit `da6bbb8` landed real code fixes (40 files) alongside the previous audit's records. This is the first cycle where the prior backlog shrank primarily by **code change** rather than by documentation — the prior subtotal dropped from 91 to 72.

## Main takeaways

**Genuinely resolved since the prior audit — 10 of the 13 prior Moderates closed, 7 by code fix and 3 by user-confirmed design record:**

- **Functional suitability:** the self-contradictory post-link failure notice — fixed via `setupFailed`/`setup_failed` threading through `link.ts` → exchange route → `PlaidLinkButton`.
- **Compatibility ×2:** Plaid 429 now retried with `Retry-After`-aware backoff; advisory lock now namespaced (`LOCK_CLASS_ID` "SPR1").
- **Reliability ×3:** the `pg` client-side `query_timeout` no longer defeats the sync lock's designed 503 path (verified against installed `pg@8.23.0` source); 429 retry; pool-usage comment corrected.
- **Interaction capability ×4:** per-key removal state (with attributed failure messages), `Intl`-based money formatting with a home-page Currency column, `'—'` for null balances, and retry in-flight feedback — the entire Moderate backlog for the weakest characteristic, closed in one pass.
- **Security:** plaintext financial data at rest — now a recorded accepted trade-off (`financial-data-plaintext-at-rest.md`) with revisit triggers.
- **Safety:** reward-rate provenance — `cards.seed.ts` now requires `ratesVerified: { on, source }`, validated by the seed script (`card-rates-provenance.md`).
- **Flexibility:** the missing data-export path — now a recorded deliberate deferral (`data-export-deferred.md`, `pg_dump` as interim path, revisit triggers).
- **Maintainability:** `useAsyncAction`'s per-key/global-pending asymmetry — fixed cleanly at the hook and its real call site.

**Prior concerns still lingering unaddressed (72 of the 79 points):**

- **Maintainability is now the heaviest backlog and the only characteristic with open Moderates**: the 3 structural priors remain (design-record corpus growth — now 93 records vs ~82 source files; untested `start.mjs` supervisor; `plaid.ts` grew 303 → 321 lines), and two measurably worsened, including `format:check` drift (40 → ~50 files, with the brand-new `money.ts` landing pre-drifted).
- **The Minor backlogs did not move at all**: interaction capability's 12 accessibility-cluster Minors (three consecutive audits now — including two near-misses where the fix commit threaded `institutionName` right past the generic `confirm()` text and raw date cell), security's 8, safety's 8, performance's 5, functional suitability's 5, compatibility's 6, reliability's 6, flexibility's 3.

**Newly surfaced this audit (7 points):**

- `[new]` **Maintainability (Moderate):** design-record back-references have a demonstrated blind spot — tooling validates record tags name real code, but nothing validates the reverse, and both records added in `da6bbb8` already lack `Design:` comments in the code they describe.
- `[new]` **Compatibility (Minor) / Maintainability (Minor):** the sync-lock `query_timeout` fix relies on an untyped `pg` internal under an unpinned caret range — the fix for one audit finding introduced a smaller fragility of its own (partially mitigated by `check-verified-claims.mjs`).
- `[new]` **Reliability (Minor):** `rotate-encryption-key.ts` has no per-row fault isolation — one undecryptable token blocks rotation for every item.
- `[new]` **Maintainability (Minor ×2):** `useAsyncAction`'s `pending`/`pendingKeys` split has no type-level link to the `key` option (the fixed defect's class is mitigated, not prevented); three unused exports flagged by `knip`.

One performance candidate (the sync lock destroying its connection per acquisition) and one safety candidate (the `confirm()`-guarded cascade delete) were both examined and rejected as findings — each is a deliberate, recorded design decision.

## Score

| Characteristic | Major | Moderate | Minor | Score |
|---|---|---|---|---|
| Functional suitability | 0 | 0 | 5 (5 prior) | 5 |
| Performance efficiency | 0 | 0 | 5 (5 prior) | 5 |
| Compatibility | 0 | 0 | 7 (6 prior, 1 new) | 7 |
| Interaction capability | 0 | 0 | 12 (12 prior) | 12 |
| Reliability | 0 | 0 | 7 (6 prior, 1 new) | 7 |
| Security | 0 | 0 | 8 (8 prior) | 8 |
| Maintainability | 0 | 4 (3 prior, 1 new) | 16 (13 prior, 3 new) | 24 |
| Flexibility | 0 | 0 | 3 (3 prior) | 3 |
| Safety | 0 | 0 | 8 (8 prior) | 8 |

**Score: 79 (prior: 72, new: 7)** — down from 100 (prior: 91, new: 9) last cycle.

Scoring: Major = 5, Moderate = 2, Minor = 1.

The prior subtotal fell 91 → 72, and for the first time the reduction came overwhelmingly from code fixes (10 Moderates retired, 7 by code). The remaining backlog is now almost entirely Minor-severity, concentrated in maintainability's structural trends and interaction capability's accessibility cluster — the latter untouched across three audits and the most obvious target for the next fix pass.
