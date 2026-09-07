---
characteristic: "functional suitability"
---
# Summary

Four auditors independently assessed functional suitability (ISO/IEC 25010:2023 §3.1) against `.claude/design/current`. All four converged: no major or moderate concerns remain. Prior-round findings were verified as genuinely fixed in code (`useAsyncAction` error keying, `unofficial_currency_code` carried end-to-end) or formally accepted as recorded deferrals (`reward-aggregation-deferred.md`, `reward-caps-deferred.md`, `operator-is-developer.md`) and were not re-raised. One auditor traced the full design record (~90 records) against the domain code and found every implementation matched its record exactly (categorization sign rules, sync persistence and carry, seed reconciliation, Plaid adapter, optimistic writes, API contract, crypto rotation). One auditor also verified that a prior audit's "currency not shown in transaction table" claim is false against current code.

Three minor findings had strong cross-agent consensus (3 of 4 auditors each).

# Major Concerns

None.

# Moderate Concerns

None.

# Minor Concerns

- **Sync-complete status omits `modified`/`removed` counts** (3/4 auditors) — `src/app/useSyncAll.ts:27-34` reports only `+N added` (plus skip/drop wording), though `SyncItemResult` (`src/lib/sync.ts:17-26`) already carries `modified` and `removed`, which are read nowhere else. An update-only or delete-only sync reports "+0 added" with no indication the sync did real work. No design record documents this as intentional.

- **Seed pipeline never sanity-checks the `rate` value** (3/4 auditors) — `scripts/seed-cards.ts` `assertSeedIsValid` (lines ~36-74) validates slug/name/category uniqueness and non-blankness but nothing bounds `rate` (non-negative, plausible magnitude) before it is written verbatim (`String(category.rate)`, line 143). A typo like `60` instead of `6` would seed silently and misstate every reward-rate display. Since `card-catalog-in-code` puts sole editorial control in this hand-edited file, this is the one place such a mistake could be caught cheaply and isn't.

- **Reward-rate cells carry no unit in the value itself** (3/4 auditors) — `src/app/accounts/[accountId]/TransactionTable.tsx:53-69` (`rateCellText`): the "Cashback %" vs "Multiplier" distinction lives only in the column header (per the accepted `card-type-decides-rate-unit` design); the cell renders a bare number. Outside the header's context (screenshot, copy/paste, future export), "6" is ambiguous between 6% cashback and 6x points.
