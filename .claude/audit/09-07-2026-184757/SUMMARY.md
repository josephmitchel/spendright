# Audit Summary — 09-07-2026-184757

## Overview

No Major concerns were found in any of the nine ISO/IEC 25010:2023 characteristics. All prior-round fixes were independently verified in code (logo split off the poll, pool sizing, crash backstop, CSP nonce, enrichment-failure recording, live-region feedback), and the recorded deferrals and accepted boundaries were respected across all 36 auditor runs.

Main takeaways:

- **Multi-item UI regression** — the prior round's "removal pending feedback" fix uses one page-wide pending flag, so removing one institution disables and mislabels every other institution's Remove control. The one finding that is a regression introduced by an earlier audit fix.
- **Monetary presentation is the weakest user-facing area** (flagged 4/4 in interaction capability) — raw unlocalized numbers, no currency column on the home page, ambiguous blank cells for null balances. Not covered by the `unstyled-for-now` carve-out.
- **Plaid 429 rate-limiting is treated as a hard permanent failure** — raised independently by both compatibility and reliability; the recorded deferral (`transient-plaid-retry.md`) didn't consider the interoperability/user-facing-failure angle.
- **A verified `pg` driver defect defeats the sync lock's graceful 503 path** — the client-side `query_timeout` (35s) fires before the 60s `lock_timeout`, turning the designed "try again" response into a generic 500.
- **Two "should be a recorded decision" gaps** — plaintext financial data at rest (only the Plaid token is encrypted) and the absence of any data-export path; both are plausibly acceptable at this stage but, unlike comparable trade-offs, have no design record.
- **Reward-rate accuracy has no provenance guard** — an in-range transcription error in `cards.seed.ts` passes silently and gets permanently baked into categorized transactions.
- **The design-record corpus (88 records vs ~80 source files) is outgrowing the code**, and its custom consistency tooling has no tests of its own — a trend to watch, not a defect.

## Score

| Characteristic | Major (×5) | Moderate (×2) | Minor (×1) | Subtotal |
|---|---|---|---|---|
| Functional Suitability | 0 | 1 | 5 | 7 |
| Performance Efficiency | 0 | 0 | 4 | 4 |
| Compatibility | 0 | 2 | 7 | 11 |
| Interaction Capability | 0 | 3 | 11 | 17 |
| Reliability | 0 | 3 | 6 | 12 |
| Security | 0 | 2 | 8 | 12 |
| Maintainability | 0 | 3 | 11 | 17 |
| Flexibility | 0 | 1 | 4 | 6 |
| Safety | 0 | 1 | 8 | 10 |
| **Total** | **0** | **16** | **64** | — |

**Score: 96** (0×5 + 16×2 + 64×1)
