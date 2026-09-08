---
characteristic: "safety"
---
# Summary

All four auditors reached identical conclusions. SpendRight moves no funds and Plaid access is read-only, so "safety" here concerns the user's financial data and the decisions its reward guidance informs. The prior Moderate (reward-rate provenance) remains resolved via the `ratesVerified: { on, source }` requirement enforced by `assertSeedIsValid` (`scripts/seed-cards.ts:85-97`). All eight prior Minor concerns remain open and byte-for-byte unchanged; no new concerns were found. Independent sweeps confirmed deliberate fail-safe design in the crypto/key-rotation path, sync-pipeline locking, category-write validation, and process supervision, and that the `confirm()`-guarded irreversible institution delete remains a deliberate, recorded design choice (`item-delete-plaid-first.md`). None of the open items involve a path that can directly corrupt or lose financial data — they are hazard-communication and cross-check gaps.

Totals: 0 Major, 0 Moderate, 8 Minor (all prior, 0 new).

# Major Concerns

None.

# Moderate Concerns

None. (`[prior — resolved]` Reward-rate provenance gap remains fixed via per-card `ratesVerified` validation.)

# Minor Concerns

All flagged by all 4 auditors:

- `[prior]` **`items.error` message collision masks a stale-balance hazard.** `src/lib/sync-outcome.ts:57-62` — when a sync both skips rows and fails the account refresh, the skipped-rows message always wins; `ACCOUNT_REFRESH_FAILED_MESSAGE` is silently dropped, so the user isn't told balances may be stale.

- `[prior]` **Destructive seed reconcile has no confirmation, dry-run, or preview.** `scripts/seed-cards.ts` (`retireMissing`) soft-retires every card/category absent from the seed file with no prompt, logging only after the fact; an emptied seed file or misdirected `DATABASE_URL` silently retires the whole catalog.

- `[prior]` **All warnings render with identical visual weight.** `src/components/ErrorNotice.tsx` gives a transient sync blip, an irreversible cursor-drop, and a systemic `BAD_CONFIG` failure the same `role="alert"` treatment with no severity signal.

- `[prior]` **`kindForAmount` silently routes `NaN` into ordinary spend classification.** `src/lib/category-kinds.ts:6-9` — `Number(amount) < 0 ? 'credit' : 'card'` sends a malformed Plaid amount into `'card'` with no warning anywhere in the call chain.

- `[prior]` **`matchCard` has no semantic guard against a wrong-but-unique seed mapping.** `src/lib/cards.ts:8-18` is a pure case-insensitive string match against `plaidAccountNames` with no cross-check against Plaid's account type/subtype.

- `[prior]` **No duplicate-institution guard at link time.** `src/lib/link.ts` keys items by Plaid `itemId` only; relinking the same institution creates a second independently-syncing item with no detection or warning.

- `[prior]` **Balance staleness is a raw timestamp, not a hazard threshold.** `src/app/page.tsx:58` renders bare `updatedAt` with no flag when the gap exceeds the hourly sync cadence; a frozen timestamp is the only user-facing signal if the sync scheduler has silently died (the crash backstop only logs to the server console).

- `[prior]` **Rate cells carry no inline unit.** `rateCellText` (`TransactionTable.tsx:66-78`) returns a bare number; the %-vs-multiplier meaning lives only in the column header. (Also tracked under functional suitability.)
