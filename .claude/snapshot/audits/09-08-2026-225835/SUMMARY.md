# Audit Summary — 09-08-2026-225835

## Main takeaways

**Everything carried in open from the last audit got resolved.** All five
open concerns from 09-08-2026-223901 were independently verified fixed by
every auditor assigned to their characteristic:

- `start-mjs-shutdown-signal-race` (reliability, moderate) — the restart
  timeout now honors `shuttingDown` and the signal handler exits directly
  when the child is already dead.
- `startup-crash-loop-no-transient-recovery` (reliability, moderate) — new
  `waitForPostgres()` retries transient connect errors for up to 45s inside
  one boot attempt, under the supervisor's 60s warm-up deadline.
- `caller-contract-snapshot-gap` (maintainability, minor) — SNAPSHOT now
  names both "Caller contract" protocols.
- `exchange-response-snake-case` (maintainability, minor) — `ExchangeResponse`
  is fully camelCase; `link_token` keeps a self-explaining Plaid-mirror note.
- `served-account-columns-opt-in-allowlist` (maintainability, minor) —
  `accounts.ts` now uses the same `getTableColumns` destructure-out
  convention as `items.ts`/`transactions.ts`.

(The two concerns already marked resolved last round — `focus-loss-on-disabled-controls`
and `react-plaid-link-unpinned` — were spot-checked for regression anyway and
both hold; per the lifecycle they drop out of this folder.)

**Newly surfaced: the first safety findings of the era, plus one
maintainability doc gap.** Seven of the nine characteristics (functional
suitability, performance efficiency, compatibility, interaction capability,
reliability, security, flexibility) returned zero new findings across all
their auditors. The four new concerns:

- `item-removal-wedged-on-invalid-token` (safety, **moderate**) — a
  decryptable token that Plaid definitively rejects (e.g. `INVALID_ACCESS_TOKEN`
  after a `PLAID_ENV` change) re-throws past the `ITEM_NOT_FOUND`-only
  exception and permanently blocks local deletion of the item and its data,
  violating the "removal is never wedged" invariant SNAPSHOT states.
- `sync-removed-delete-not-item-scoped` (safety, minor) — the one
  irreversible sync-path delete is scoped only by Plaid's id list, not by
  the item whose lock it runs under.
- `account-balances-no-currency-disambiguation` (safety, minor) — the
  account-detail page renders balances with `narrowSymbol` and no visible
  currency code, unlike every other money surface.
- `startup-canary-convention-undocumented` (maintainability, minor) — the
  four-file startup dependency-shape canary pattern wired through
  `instrumentation.ts` is load-bearing but unnamed in SNAPSHOT (same class
  as the just-fixed caller-contract gap).

Recurring pending-capture note for the next `/snapshot` (not a concern): the
untracked `drizzle/0009_backfill_reward_rate.sql` migration will stale
SNAPSHOT's "Nine migrations, 0000–0008" line once committed, and the
already-adjudicated comment-policy wording relaxation is still queued.

## Score

**Score: 5 (prior: 0, new: 5) — resolved this audit: 5**

- Open: 1 moderate (2) + 3 minor (1 each) = 5
- `item-removal-wedged-on-invalid-token` — moderate — 2
- `sync-removed-delete-not-item-scoped` — minor — 1
- `account-balances-no-currency-disambiguation` — minor — 1
- `startup-canary-convention-undocumented` — minor — 1
- Resolved (score 0): the five carried concerns listed above.

Prior subtotal is 0 for the first time this era — every previously-open
concern has been resolved; the entire remaining score is newly surfaced work.
