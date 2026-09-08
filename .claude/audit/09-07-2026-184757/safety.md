---
characteristic: "safety"
---
# Summary

Four auditors reviewed the codebase against ISO/IEC 25010:2023 §3.9, reading "property" as the user's financial data and financial decisions (SpendRight moves no funds; Plaid access is read-only). No Major concerns were found, and all four verified — in code, not just in the records — that the prior safety round's fixes landed: the seed reward-rate plausibility bound (`MAX_PLAUSIBLE_RATE = 20` in `scripts/seed-cards.ts`), the per-row balance-freshness timestamp on the home page, account-store failures surfacing via `items.error`, whole-run scheduled-sync failures surfacing via `lastSyncStatus`, the process crash backstop with supervised restart, and retire-not-delete semantics on every destructive-looking operation. The recorded deferrals (reward caps/tiers, reward aggregation, no-auth, tests) were respected by all four.

One Moderate concern was raised (rate-accuracy provenance), plus a cluster of Minor hazard-warning refinements.

# Major Concerns

None.

# Moderate Concerns

- **No verification/provenance guard against in-range reward-rate transcription errors** (1/4 auditors) — `src/db/cards.seed.ts` is the sole editorial authority for reward rates (`card-catalog-in-code.md`), with "no downstream guard" (`seed-validation.md`). The plausibility bound only catches order-of-magnitude typos; a smaller, still-plausible error (`5` typed for an actual `6`) passes silently, reaches the UI as authoritative spending-optimization guidance, and — per `categorization-is-a-historical-snapshot.md` — gets permanently baked into `transactions.reward_rate` for every transaction categorized before it's noticed. Distinct from the deferred cap/tier issue: this is about the accuracy of the flat number itself. There is no "last verified against issuer terms" marker anywhere in the seed pipeline. Related Minor from the same auditor: no in-app provenance/"verified as of" signal for displayed rates, and no product-level disclaimer that rates are headline figures.

# Minor Concerns

- **`items.error` message collision can mask a stale-balance hazard** (1/4; independently found by two reliability auditors) — `src/lib/sync-outcome.ts:57-62` always prefers the skipped-rows message over `ACCOUNT_REFRESH_FAILED_MESSAGE` when both conditions occur in one sync run, so the user learns about skipped transactions but not that the balances informing spending decisions may be stale. Fix: compose both messages or record them as a list.

- **Destructive seed reconcile has no confirmation, dry-run, or target echo** (2/4) — `scripts/seed-cards.ts` (`main()`/`retireMissing`, lines 112-133, 221-261): an emptied or truncated `cards.seed.ts` — or a misdirected `DATABASE_URL` — retires every card/category in scope with no prompt, no printed target, and no preview; the only signal is a post-hoc log line. Bounded and reversible (soft delete, self-heals on re-seed), but exactly the operator-error hazard the Operational Constraint subcharacteristic covers. `assertSeedIsValid()` validates shape but not non-emptiness. Suggested: a `--yes`-gated confirmation or printed retire-diff when the retire set is non-trivial.

- **All warnings render with identical visual weight** (1/4) — `src/components/ErrorNotice.tsx` renders a transient sync blip, a recoverable "held, 3 of 5" notice, an irreversible post-`MAX_SKIPPED_SYNCS` cursor drop, and a systemic `BAD_CONFIG` failure identically. A severity-signaling gap, not a message-content one.

- **`kindForAmount` silently routes `NaN` into ordinary spend classification** (1/4) — `src/lib/category-kinds.ts:6-9`; the inline comment documents the choice but `category-kind-sign-rule.md` doesn't mention NaN, and nothing warns if a malformed Plaid amount actually reaches it.

- **`matchCard` has no semantic guard against a wrong-but-unique seed mapping** (1/4) — `src/lib/cards.ts:8-18` is a pure case-insensitive string match; a typo'd-but-unique `plaidAccountNames` entry silently attributes an account's transactions and rate guidance to the wrong card indefinitely, with no cross-check against Plaid's account type/subtype.

- **No duplicate-institution guard at link time** (1/4) — `src/lib/link.ts` keys items by Plaid's `itemId`, so repair/update relinking is safe, but linking the same institution again as a brand-new connection creates a second independently syncing item with no detection or warning.

- **Balance staleness is a raw timestamp, not a hazard threshold** (1/4) — the "Updated" timestamps added in the prior fix leave the "is this too old to act on?" judgment entirely to the user; nothing flags a gap exceeding the scheduler's hourly cadence, which compounds with the supervisor's give-up-after-crash-loop behavior (frozen timestamps are the only signal the sync process died for good).

- **Rate cells carry no inline unit** (1/4) — `src/app/accounts/[accountId]/TransactionTable.tsx:65-77`: a bare `3` means %-cashback or a point multiplier only via the column header; `3%`/`3x` would make the figure self-describing. (Sanctioned by `card-type-decides-rate-unit.md`; raised here as a hazard-warning rough edge, also noted by the functional-suitability audit.)
