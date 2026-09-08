---
characteristic: "safety"
---
# Summary

All four auditors adopted the established scope reading ("property" = the user's financial data and financial decisions; SpendRight moves no funds, Plaid access is read-only). Consensus: no Major concerns; the prior audit's 1 Moderate and 8 Minor concerns all remain present and unaddressed in an unchanged source tree; no new scored findings. One auditor proposed a new Moderate (institution removal is an irreversible cascading hard delete guarded only by `confirm()`); two other auditors independently examined that exact surface and judged it already deliberately guarded (`useItemRemoval.ts:25`'s explicitly-scoped confirmation text plus the recorded `item-delete-plaid-first.md` design), so it is carried as an unscored note below rather than a concern. Fresh sweeps of crypto/key rotation, process supervision, sync-carry locking, and server-side category validation found those mechanisms sound.

# Major Concerns

None.

# Moderate Concerns

- `[prior]` **No verification/provenance guard against in-range reward-rate transcription errors.** `src/db/cards.seed.ts` is the sole editorial authority for reward rates; `MAX_PLAUSIBLE_RATE = 20` (`scripts/seed-cards.ts`) catches only order-of-magnitude typos. A smaller in-range error (`5` for an actual `6`) passes silently, reaches the UI as authoritative spending guidance, and — per `categorization-is-a-historical-snapshot.md` — gets permanently baked into `transactions.reward_rate` before anyone notices. No "verified against issuer terms" marker exists anywhere in the seed pipeline. (Flagged by all 4 auditors.)

# Minor Concerns

- `[prior]` **`items.error` message collision can mask a stale-balance hazard.** `recordSyncOutcome` (`src/lib/sync-outcome.ts:57-62`) always prefers the skipped-rows message over `ACCOUNT_REFRESH_FAILED_MESSAGE` when both occur in one run — the user learns about skipped transactions but not that balances may be stale. (Also raised under reliability.)
- `[prior]` **Destructive seed reconcile has no confirmation, dry-run, or target echo.** `scripts/seed-cards.ts` (`main()`/`retireMissing`, lines 112-133, 221-261) retires every card/category not in the seed file with no prompt, printed target, or preview; an emptied seed file or misdirected `DATABASE_URL` silently retires the whole catalog (soft-delete, but still the operator-error hazard).
- `[prior]` **All warnings render with identical visual weight.** `src/components/ErrorNotice.tsx` gives a transient sync blip, an irreversible cursor-drop, and a systemic `BAD_CONFIG` failure the same treatment — no severity signaling.
- `[prior]` **`kindForAmount` silently routes `NaN` into ordinary spend classification.** `src/lib/category-kinds.ts:6-9`; nothing warns if a malformed Plaid amount reaches it.
- `[prior]` **`matchCard` has no semantic guard against a wrong-but-unique seed mapping.** `src/lib/cards.ts:8-18` is a pure case-insensitive string match with no cross-check against Plaid's account type/subtype; a typo'd-but-unique `plaidAccountNames` entry silently misattributes an account's transactions and rate guidance indefinitely.
- `[prior]` **No duplicate-institution guard at link time.** `src/lib/link.ts` keys items by Plaid `itemId` only; linking the same institution again as a new connection creates a second independently-syncing item with no detection or warning.
- `[prior]` **Balance staleness is a raw timestamp, not a hazard threshold.** `src/app/page.tsx:55` renders a bare `updatedAt` with no flag when the gap exceeds the scheduler's hourly cadence — compounding with the crash-supervisor's give-up behavior, where a frozen timestamp is the only signal the sync process died.
- `[prior]` **Rate cells carry no inline unit.** `rateCellText` (`src/app/accounts/[accountId]/TransactionTable.tsx:65-77`) returns a bare number with the %-vs-multiplier meaning conveyed only by the column header. (Also tracked under functional suitability.)

## Note (not scored)

- One auditor raised the irreversible cascading hard delete on institution removal (`useItemRemoval.ts` → `removeItemCompletely` → `onDelete: 'cascade'`) as a new Moderate, arguing it lacks a design record addressing irreversibility and diverges from the retire-not-delete pattern. Two other auditors examined the same surface and concluded the existing `confirm()` with correctly-scoped warning text plus `item-delete-plaid-first.md` constitute a deliberate, adequate guard. Left unscored; if a softer path (export-before-delete, undo window) is ever wanted, it should be raised as a design decision rather than an audit finding.
