# Audit Summary — 09-08-2026-223901

## Overview

Both open concerns from the previous audit (09-08-2026-222047) are **resolved**,
each verified independently by all three auditors of its requirement:

- `focus-loss-on-disabled-controls` (moderate) — fixed systemically via the new
  shared `GuardedButton` (`aria-disabled` + guarded `onClick`, never native
  `disabled`), applied to every flagged site including the category `<select>`.
- `react-plaid-link-unpinned` (minor) — fixed by exact-pinning
  `react-plaid-link@4.2.0`; the same sweep pinned `drizzle-orm`, `pg`, and
  `plaid`, so every runtime dependency is now exact-pinned (`server-only`
  remains the sole deliberate exception).

Nothing carried forward as `prior` — the prior subtotal is zero for the first
time this era with concerns actually in play.

Newly surfaced, five concerns:

- **Reliability (moderate ×2), both in the `start.mjs` supervision path**:
  a shutdown signal arriving during the 1s crash-restart backoff is silently
  dropped and the pending restart spawns an orphan server
  (`start-mjs-shutdown-signal-race`); and the crash-loop guard plus fail-fast
  startup assertions turn a transiently-unready Postgres at cold boot into a
  permanent "giving up" stop (`startup-crash-loop-no-transient-recovery`).
  Each was flagged by one of three reliability auditors and the signal race
  was re-verified line-by-line by the synthesizer.
- **Maintainability (minor ×3)**: `ExchangeResponse`/`LinkTokenResponse`
  break the API contract's otherwise-universal camelCase convention
  (`exchange-response-snake-case`); `servedAccountColumns` hand-lists columns
  opt-in, inverting the documented destructure-omit convention that
  `items.ts`/`transactions.ts` follow (`served-account-columns-opt-in-allowlist`);
  and SNAPSHOT names only one of the two unenforced "caller contract" sites,
  a doc-completeness item for the next `/snapshot` (`caller-contract-snapshot-gap`).

Functional suitability, performance efficiency, compatibility, interaction
capability, security, flexibility, and safety all returned zero new findings
across their auditors. One candidate major from an interaction-capability
auditor — a claimed false-success display when picking a category on the
stale (`aria-disabled`) select — was adjudicated a false positive: the select
is controlled (`value={value ?? ''}`), and React synchronously restores a
controlled select's DOM value when the change handler doesn't update state,
so no desync occurs; two of the three auditors dismissed it on exactly this
ground.

Recurring note for the next `/snapshot` (not findings, per standing
guidance on untracked files): the uncommitted `drizzle/0009_backfill_reward_rate.sql`
migration will make SNAPSHOT's "Nine migrations, 0000–0008" line stale, and
the comment-policy wording relaxation confirmed 2026-09-08 is still pending.

## Score

**Score: 7 (prior: 0, new: 7) — resolved this audit: 2**

| Concern | Level | Status | Points |
| --- | --- | --- | --- |
| start-mjs-shutdown-signal-race | moderate | new | 2 |
| startup-crash-loop-no-transient-recovery | moderate | new | 2 |
| exchange-response-snake-case | minor | new | 1 |
| served-account-columns-opt-in-allowlist | minor | new | 1 |
| caller-contract-snapshot-gap | minor | new | 1 |
| focus-loss-on-disabled-controls | moderate | resolved | 0 |
| react-plaid-link-unpinned | minor | resolved | 0 |

Previous audit scored 3 (prior: 0, new: 3); this audit resolves both of those
open concerns and surfaces 7 points of new ones. The prior subtotal staying
at 0 means concerns keep getting cleared within one cycle of being found;
this round's crop is dominated by two genuine supervisor-logic gaps and three
convention/documentation nits.
