---
characteristic: "safety"
---
# Summary

All four auditors agree. The prior audit's sole Moderate — no provenance guard against in-range reward-rate transcription errors — is genuinely resolved: `src/db/cards.seed.ts` now requires `ratesVerified: { on, source }` per card, `scripts/seed-cards.ts::assertSeedIsValid` rejects a blank source, malformed date, or future date, and the decision is recorded in `card-rates-provenance.md`. Every auditor verified the fix in code.

The eight prior Minor concerns all remain open, untouched by the fix commit. They concern hazard communication and missing cross-checks rather than any path that could directly corrupt or lose financial data. Independent sweeps of the sync pipeline, category-write path, crypto/rotation, process supervision, and the new money formatting found no new safety concerns. The `confirm()`-guarded irreversible institution delete continues to be judged a deliberate, adequate guard (per `item-delete-plaid-first.md`) and is carried as an unscored note.

Totals: 0 Major, 0 Moderate (1 prior resolved this cycle), 8 Minor (all prior, 0 new).

# Major Concerns

None.

# Moderate Concerns

None open. `[prior — resolved]` Reward-rate provenance gap, fixed via the `ratesVerified` attestation in the seed pipeline as described above.

# Minor Concerns

- `[prior]` **`items.error` message collision can mask a stale-balance hazard.** `src/lib/sync-outcome.ts:57-62` always prefers the skipped-rows message over `ACCOUNT_REFRESH_FAILED_MESSAGE` when both occur in one sync — the user learns transactions were skipped but not that balances may be stale.
- `[prior]` **Destructive seed reconcile has no confirmation, dry-run, or pre-run preview.** `scripts/seed-cards.ts` retires every card/category absent from the seed file with no prompt, logging only after the fact; an emptied seed file or misdirected `DATABASE_URL` silently retires the whole catalog. Soft-delete limits the blast radius to future matching capability, but the operator-error hazard is unaddressed.
- `[prior]` **All warnings render with identical visual weight.** `src/components/ErrorNotice.tsx` gives a transient sync blip, an irreversible cursor-drop, and a systemic `BAD_CONFIG` failure the same `role="alert"` treatment with no severity signal.
- `[prior]` **`kindForAmount` silently routes `NaN` into ordinary spend classification.** `src/lib/category-kinds.ts:6-9` — `Number(amount) < 0 ? 'credit' : 'card'` sends a malformed Plaid amount into `'card'` with no warning anywhere in the call chain.
- `[prior]` **`matchCard` has no semantic guard against a wrong-but-unique seed mapping.** `src/lib/cards.ts:8-18` is a pure case-insensitive string match with no cross-check against Plaid's account type/subtype; a typo'd-but-unique seed entry would silently misattribute transactions and rate guidance indefinitely.
- `[prior]` **No duplicate-institution guard at link time.** `src/lib/link.ts` keys items by Plaid `itemId` only; relinking the same institution creates a second independently-syncing item with no detection or warning.
- `[prior]` **Balance staleness is a raw timestamp, not a hazard threshold.** `src/app/page.tsx:58` renders a bare `updatedAt` with no flag when the gap exceeds the hourly sync cadence — and a frozen timestamp is the only user-facing signal if the sync process has silently died (the crash supervisor logs only to the server console).
- `[prior]` **Rate cells carry no inline unit.** `rateCellText` (`src/app/accounts/[accountId]/TransactionTable.tsx:66-78`) returns a bare number; the %-vs-multiplier meaning lives only in the column header (documented in `card-type-decides-rate-unit.md`; also tracked under functional suitability).
