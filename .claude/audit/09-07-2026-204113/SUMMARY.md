# Audit Summary — 09-07-2026-204113

36 auditors (4 per characteristic × 9 characteristics) ran against a source tree that is byte-identical to the one audited in 09-07-2026-184757 — the only intervening commits touched audit tooling. This audit is therefore primarily a measure of what the prior findings backlog looks like under independent re-verification, plus whatever fresh eyes could still surface.

## Main takeaways

**Prior concerns still lingering unaddressed (the overwhelming bulk of the score).** No code has changed, so essentially the entire prior backlog carries forward:

- The three cross-cutting Moderates every relevant team of auditors re-confirmed: the **Plaid 429 treated as a permanent failure** (compatibility + reliability), the **`pg` client-side `query_timeout` defeating the sync lock's designed 503 path** (reliability), and the **self-contradictory post-link failure message** (functional suitability).
- **Interaction capability remains the weakest surface**: 3 Moderates (page-wide removal state, unlocalized money with no home-page currency, ambiguous blank balance cells) and 11 Minors, all prior, none touched.
- **Security's plaintext-financial-data-at-rest** and **safety's reward-rate provenance gap** each remain the lone Moderate in otherwise mature postures.
- **Flexibility's missing data-export path** and **maintainability's three structural Moderates** (design-record corpus growth, untested `start.mjs` supervisor, 303-line `plaid.ts`) are unchanged.

**Genuinely resolved since the prior audit** (all via design-record or script fixes that landed just before it closed):

- Key-rotation script now reports completion counts (reliability).
- `DATABASE_URL` session-mode requirement now recorded as a dated deployment constraint (compatibility).
- Postgres-only sync-lock vendor coupling now explicitly documented with a revisit trigger (flexibility).
- The esbuild/`drizzle-kit` dev-dependency advisory is no longer counted, per the standing acceptance record `dev-dependency-advisories-accepted.md` (security) — the prior audit re-raised it despite that record; this one honors it.

**Newly surfaced this audit (9 points of the total):**

- `[new]` **Maintainability (Moderate):** `useAsyncAction`'s per-key errors vs. global `pending` asymmetry — identified as the root cause of the long-standing removal-state defect, and a trap for any future caller.
- `[new]` **Interaction capability (Moderate):** Retry gives no in-flight feedback on the home and account pages, contradicting `async-status-announced.md`.
- `[new]` **Interaction capability (Minor):** "Remove"/"Fix connection" buttons have non-unique accessible names across institutions.
- `[new]` **Maintainability (Minor ×2):** `sync-failure.ts`/`sync-outcome.ts` naming mismatch; `format:check` gate wired to nothing with 40 files already drifted.
- `[new]` **Reliability (Minor):** the crash-loop guard's rolling 60s window is defeated by a ~60-70s crash cadence.
- `[new]` **Performance efficiency (Minor):** `SELECT *` on `items` (including the logo blob) in hot per-sync paths.

One proposed new safety Moderate (irreversible cascading institution delete) was examined by two other auditors and judged already deliberately guarded (`confirm()` + `item-delete-plaid-first.md`); it is recorded as an unscored note in `safety.md`.

## Score

| Characteristic | Major | Moderate | Minor | Score |
|---|---|---|---|---|
| Functional suitability | 0 | 1 (1 prior) | 5 (5 prior) | 7 |
| Performance efficiency | 0 | 0 | 5 (4 prior, 1 new) | 5 |
| Compatibility | 0 | 2 (2 prior) | 6 (6 prior) | 10 |
| Interaction capability | 0 | 4 (3 prior, 1 new) | 12 (11 prior, 1 new) | 20 |
| Reliability | 0 | 3 (3 prior) | 6 (5 prior, 1 new) | 12 |
| Security | 0 | 1 (1 prior) | 8 (8 prior) | 10 |
| Maintainability | 0 | 4 (3 prior, 1 new) | 13 (11 prior, 2 new) | 21 |
| Flexibility | 0 | 1 (1 prior) | 3 (3 prior) | 5 |
| Safety | 0 | 1 (1 prior) | 8 (8 prior) | 10 |

**Score: 100 (prior: 91, new: 9)**

Scoring: Major = 5, Moderate = 2, Minor = 1.

The prior subtotal (91) is the number to watch: it will only shrink when the carried-forward backlog is actually fixed. Four prior findings were retired this cycle (three by design-record documentation, one by honoring an existing acceptance record), and zero by code change — consistent with no source commits landing between the audits.
