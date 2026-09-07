---
characteristic: 'functional suitability'
---

# Summary

Four independent auditors reviewed the codebase against ISO/IEC 25010:2023 §3.1 (functional completeness, correctness, appropriateness). The implemented functionality is unusually well-specified and internally consistent: sign-based category-kind routing, pending→posted category carry, cursor/skip handling, card matching, seed reconciliation, pagination clamping, and optimistic category-write reconciliation were all verified in depth against their design records with no arithmetic, off-by-one, or precision defects found (money stays `numeric` strings end-to-end). One auditor found nothing at all. **No major findings.** The recurring theme in the rest: the app's _stated_ purpose (spend optimization) outruns what it currently _does_, and these same gaps have now surfaced identically across three same-day audit runs — they should either be fixed or explicitly recorded in `.claude/design` as accepted MVP simplifications so future audits stop re-flagging them.

# Major Concerns

None.

# Moderate Concerns

- **Rewards are captured but never computed or aggregated — the "optimization" half of the stated objective doesn't exist** — flagged by 3 of 4 auditors. `amount` and `rewardRate` are stored per transaction (`src/db/schema.ts:112,120`), but no code anywhere in `src/` multiplies rate × amount, sums rewards by category/card/period, or compares actual-vs-optimal card usage (grep-confirmed: zero hits for any aggregation). The app currently implements only the data-collection half of "credit card spending optimization" (`README.md:3-5`, `src/app/layout.tsx:5`). Likely deliberate incremental build, but unlike the single-card decision it is **not** recorded in `.claude/design` as an accepted temporary omission — confirm scope with the user and record it either way.
- **No capped/tiered reward-rate modeling — displayed rates become wrong past real-world spending caps** — flagged by 3 auditors. `cardCategories.rate` is a single flat `numeric` (`src/db/schema.ts:40`); the seeded Amex Blue Cash Preferred shows flat 6% groceries/streaming (`src/db/cards.seed.ts:28-34`) while the real card caps 6% at $6,000/year then drops to 1%. No schema field, seed field, or UI affordance can express this (`TransactionTable.tsx:53-65`), so past the cap every transaction displays a reward rate that is simply false — a correctness gap in the primary value proposition. (Also raised under Safety as an operational-constraint hazard.)
- **Concurrent multi-item actions silently clobber each other's error message** — flagged by 2 auditors. `useAsyncAction.ts:13,26` holds a single shared `error` state cleared unconditionally at the start of every `run()`; `useItemRemoval.ts:9-18` keys its in-flight guard per `itemId`, so removals of _different_ institutions share one error slot (rendered globally at `page.tsx:142`). Trace: remove item A → fails, error shown; remove item B → `run()` wipes A's error; B succeeds → A remains un-removed with no explanation. The same clobbering class was already identified and fixed for category edits (`optimistic-category-writes.md`) but never carried over to this shared hook (also used by `useSyncAll` and `PlaidLinkButton`).

# Minor Concerns

- **Sync-complete status omits `modified`/`removed` counts** (`src/app/useSyncAll.ts:27-34` vs `SyncItemResult`, `src/lib/sync.ts:104-111`) — flagged by 3 auditors. An update-only or delete-only sync reports "+0 added" with no signal anything happened.
- **Reward-rate cells carry no unit** (`TransactionTable.tsx:53-65,92`) — the "Cashback %" vs "Multiplier" distinction lives only in the column header; ambiguous once the value leaves that context (screenshot, copy/paste, future CSV export).
- **Product metadata overstates current capability** (`src/app/layout.tsx:5`) — "Spending optimization through credit card rewards" describes the unbuilt feature above; the README's "tracks which reward category each purchase earned" is the accurate framing.
- **Seed pipeline never sanity-checks the `rate` value** (`scripts/seed-cards.ts`, `assertSeedIsValid`) — validates names/slugs/uniqueness but not that `rate` is a sane non-negative number; a typo'd `60` instead of `6` seeds silently.
- **`unofficial_currency_code` dropped at ingest** (`src/lib/plaid.ts:159,171`) — non-ISO-currency accounts/transactions display a blank currency instead of falling back to the unofficial code (covered in depth under Compatibility).
- **Stale card header after a partial poll failure** (`useAccountData.ts:33-38`) — `setCard` only recomputes when both account and cards reads succeed in the same tick; self-healing, and `categoriesMayBeStale` correctly disables editing in the interim.
- **Unsupported-account remediation is developer-only** (`accounts/[accountId]/page.tsx:154-159`) — the only remedy is editing `cards.seed.ts` and running a CLI command; consistent with the documented `card-catalog-in-code` design while user == developer, but a completeness ceiling if a non-developer user is ever intended.
