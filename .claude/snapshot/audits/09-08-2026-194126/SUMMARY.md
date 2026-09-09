# Audit Summary — 09-08-2026-194126

## Overview

This is the third completed audit of the current snapshot era, and it marks a full turnover of the concern ledger: **every prior concern is now resolved, and the entire remaining score is new findings.** The fix commits since the last audit (`fbf2912`, `4cd8e86`) closed out all 15 previously-open items — both functional-suitability sticky-state defects, the performance `Intl.NumberFormat` caching, both compatibility items (Node-version enforcement, port-conflict fail-fast), all four interaction-capability accessibility/UX items, the security axios-redaction pinning (now with a startup canary), all three maintainability toolchain items, and all three flexibility invariant/config items. Five of nine characteristics (performance efficiency, compatibility, security, maintainability, safety) are now fully clean, with reliability's server side clean as well.

What this audit newly surfaced, in rough priority order:

1. **A regression introduced by a prior fix** (functional suitability, Moderate): broadening `stickyKeys` to stop view flicker also silently disabled the SNAPSHOT-documented "stale lists disable category editing" safeguard on the account detail page — the sticky `loaded` flags latch true forever, so the staleness gate is unreachable in steady state. The same flags are serving two purposes (view stability vs. write-safety) that need different semantics.
2. **Silent failure in the Plaid Link client flow** (reliability, Moderate + related Minor): if the Link script from `cdn.plaid.com` never loads, connect/repair hangs silently with no timeout, error, or retry — inconsistent with the app's otherwise strict never-fail-silently discipline. Relatedly, the "Opening Plaid Link…" status disappears before Link actually opens.
3. **A documented-but-unimplemented seed validation** (functional suitability, Moderate): SNAPSHOT.md claims duplicate/blank card _names_ fail loudly, but `assertSeedIsValid` only checks slugs — worth closing before a second card lands.
4. **Removal confirmation doesn't name the institution** (interaction capability, Moderate): the app's most destructive action confirms with a fixed string even though `institutionName` is in scope — a one-line fix.
5. Two accessibility/consistency Minors: disabled category selects lack an accessible reason (`aria-describedby`), and the Node-24 pin is hand-duplicated across three files with nothing enforcing sync (the same pattern the prior era fixed twice).

## Score

**Score: 11 (prior: 0, new: 11)**

| Characteristic         | Major | Moderate | Minor   | Subtotal |
| ---------------------- | ----- | -------- | ------- | -------- |
| Functional Suitability | 0     | 2 [new]  | 0       | 4        |
| Performance Efficiency | 0     | 0        | 0       | 0        |
| Compatibility          | 0     | 0        | 0       | 0        |
| Interaction Capability | 0     | 1 [new]  | 1 [new] | 3        |
| Reliability            | 0     | 1 [new]  | 1 [new] | 3        |
| Security               | 0     | 0        | 0       | 0        |
| Maintainability        | 0     | 0        | 0       | 0        |
| Flexibility            | 0     | 0        | 1 [new] | 1        |
| Safety                 | 0     | 0        | 0       | 0        |
| **Total**              | **0** | **4**    | **3**   | **11**   |

Era trend: the prior subtotal dropping to 0 means every previously-flagged concern has been genuinely resolved; the 11 points here are entirely fresh discoveries from deeper passes (client-side Plaid Link resilience, spec-vs-implementation gaps, and one fix-induced regression).
