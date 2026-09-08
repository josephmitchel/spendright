# Audit Summary — 09-07-2026-221302

36 auditors (4 per characteristic × 9 characteristics) ran against `e8a27ef` plus the uncommitted working tree. This cycle's changes since the last audit were documentation/tooling, not functional code (design-corpus compaction, the `max-lines` ESLint rule, the two-directional `check-design-refs.mjs`), and the results reflect that: the maintainability Moderates those changes targeted are genuinely closed, while every runtime-code backlog is byte-for-byte unchanged.

## Main takeaways

**Prior concerns resolved this cycle (all in maintainability, all by the design/tooling work):**

- Design-record corpus growth — compacted 93 → 62 records vs 81 source files, with a recorded "extend, don't add" policy (`design-corpus-compaction.md`). Multiple auditors in other characteristics verified the compaction was lossless: the data-export deferral, the plaintext-at-rest decision, and the card-rates-provenance record all survived their merges intact.
- Design-record back-reference blind spot — `check-design-refs.mjs` now validates both directions and is wired into `npm run lint`; the two previously-uncited records now carry `Design:` markers.
- `plaid.ts` multi-responsibility growth — closed via the `max-lines: 400` mechanical guardrail plus the user-confirmed recorded deferral of the split (`plaid-module-seams.md`). Note: 2 of 4 maintainability auditors would keep this open since the file itself (322 lines) is unchanged; it is closed here per the repo's convention that recorded, user-confirmed decisions are not re-litigated.
- The "no size guardrail" Minor — same ESLint rule.

**Prior concerns still lingering unaddressed (72 of the 78 points):**

- **The Minor backlogs did not move at all — for the second consecutive cycle.** Interaction capability's 12 accessibility-cluster Minors (four consecutive audits now), security's 8, safety's 8, compatibility's 7, reliability's 7, performance's 5, functional suitability's 5, flexibility's 3, and maintainability's 15 are all confirmed unchanged, most byte-for-byte. The interaction-capability cluster remains the most obvious target for a dedicated fix pass.
- **`format:check` drift keeps worsening** — the same core files remain prettier-dirty and this cycle's own edits (`eslint.config.mjs`, `money.ts`) landed pre-drifted, because nothing runs the gate. One auditor argued for upgrading this to Moderate on trend; it stays Minor this cycle.
- The one open maintainability Moderate — `scripts/start.mjs`'s untested stateful supervisor — is unchanged.

**Newly surfaced this audit (6 points):**

- `[new]` **Functional suitability (Moderate):** the post-link "Connected, but the first sync didn't finish:" prefix is also wrong when only account *storage* failed and the sync itself finished cleanly (`PlaidLinkButton.tsx:41-52`) — a second uncovered path in the same code three prior audit rounds already worked on for the `setup_failed` case.
- `[new]` **Reliability (Moderate):** `exchangePublicToken` and `createLinkToken` lack the `retryOnce` wrapper every other Plaid call has (`plaid.ts:157-178`). `exchangePublicToken` runs right after the user completes external OAuth; a transient 5xx discards the single-use `public_token` and forces the entire link flow to be redone. Found independently by two auditors.
- `[new]` **Maintainability (Minor):** `npx madge --circular src` — the invocation prior audits describe — silently processes 0 files and prints a false "No circular dependency found!"; the correct `--extensions ts,tsx` form is recorded nowhere, so the dependency-cycle gate can silently pass on nothing.
- `[new]` **Flexibility (Minor):** `scripts/start.mjs`'s timing constants (crash-loop window/threshold, warm-up deadline/poll, restart delay) are bare literals with no env override and no recorded rationale — same pattern as the already-tracked fixed-bounds finding, different file.

**Out-of-scope observation (unscored):** one maintainability auditor reported that `knip`'s stdout contained an anomalous non-knip line referencing an external domain (`www.vestauth.com`). The auditor did not act on it. Worth a manual look at the toolchain, since unexpected output injected into dev-tool stdout can indicate a compromised dependency.

## Score

| Characteristic | Major | Moderate | Minor | Score |
|---|---|---|---|---|
| Functional suitability | 0 | 1 (1 new) | 5 (5 prior) | 7 |
| Performance efficiency | 0 | 0 | 5 (5 prior) | 5 |
| Compatibility | 0 | 0 | 7 (7 prior) | 7 |
| Interaction capability | 0 | 0 | 12 (12 prior) | 12 |
| Reliability | 0 | 1 (1 new) | 7 (7 prior) | 9 |
| Security | 0 | 0 | 8 (8 prior) | 8 |
| Maintainability | 0 | 1 (1 prior) | 16 (15 prior, 1 new) | 18 |
| Flexibility | 0 | 0 | 4 (3 prior, 1 new) | 4 |
| Safety | 0 | 0 | 8 (8 prior) | 8 |

**Score: 78 (prior: 72, new: 6)** — down from 79 (prior: 72, new: 7) last cycle.

Scoring: Major = 5, Moderate = 2, Minor = 1.

The prior subtotal held flat at 72: maintainability retired 7 prior points (3 Moderates + 1 Minor), which exactly offset last cycle's 7 new points aging into the prior bucket. The headline is that documentation/tooling work cleans up the maintainability ledger but doesn't touch the runtime backlog — the ~70 points of carried Minors, led by interaction capability's four-audit-old accessibility cluster, will only shrink through code fixes. The two new Moderates (both in the link flow's error/retry handling) are small, well-localized fixes and the natural place to start.
