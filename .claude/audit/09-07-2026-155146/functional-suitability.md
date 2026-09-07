---
characteristic: "functional suitability"
---
# Summary

Five independent auditors reviewed the codebase against ISO/IEC 25010:2023 §3.1 (functional completeness, correctness, appropriateness), cross-checked against the design records in `.claude/design/current/`. The unanimous assessment: the codebase is unusually well-governed for its stage — nearly every non-trivial behavior (sign-based category-kind routing, pending→posted category carry, sync cursor handling, pagination clamping, optimistic-write settlement, seed reconciliation) matches its recorded design exactly, and no data-corrupting or silently-wrong-result bugs were found. Money and reward values are stored as Postgres `numeric` via strings end-to-end, avoiding floating-point precision loss. No auditor reported a Major finding.

The recurring themes across auditors: (1) the app's core stated purpose — reward optimization — has no delivering function yet (only the data-collection half exists), (2) reward rates are modeled flat with no cap/tier support even though the one seeded card has a real-world cap, and (3) one concrete UI bug where concurrent institution removals can clobber each other's error message.

# Major Concerns

None found by any of the five auditors.

# Moderate Concerns

- **No capped/tiered reward-rate support, so the displayed rate becomes inaccurate for real cards** (flagged by 3 of 5 auditors) — `src/db/schema.ts:40` (`cardCategories.rate` is a single flat `numeric`), `src/db/cards.seed.ts:29-33`, `src/app/accounts/[accountId]/TransactionTable.tsx:53-64`. The seeded Amex Blue Cash Preferred caps its 6% grocery/streaming categories at $6,000/year, then drops to 1%; the schema and UI cannot express this, so the app silently overstates the rate once cumulative spend crosses the cap. For an app whose purpose is spend optimization, this is a correctness gap in the core value proposition. Confirm whether it's a deliberate MVP simplification (and record it in `.claude/design`) or schedule it.

- **Rewards are never computed or aggregated** (flagged by 3 of 5 auditors) — `src/app/layout.tsx:5` and `README.md:3-5` frame the app around "spending optimization," and `amount`/`rewardRate` are captured per transaction (`src/db/schema.ts:112,120`), but nothing sums them into a category/statement/overall earned-rewards view, and there is no actual-vs-optimal card comparison anywhere. Only the data-collection half of the stated objective exists. Likely deliberate incremental sequencing — but unlike the single-card catalog, it is not documented anywhere as an accepted temporary omission. Confirm and record.

- **Concurrent institution removals can clobber each other's error message** (flagged by 2 of 5 auditors, verified in source) — `src/hooks/useAsyncAction.ts:26` has one shared error slot cleared unconditionally on every `run()`, while `src/app/useItemRemoval.ts:17` allows concurrent per-item removals. A failed removal's error notice (`src/app/page.tsx:131`) is silently wiped by a second, successful removal, leaving the failed institution stuck in the list with no explanation. This is the same clobbering pattern already fixed once for category edits (`optimistic-category-writes.md`) but never carried to this shared hook.

# Minor Concerns

- **Sync-complete UI reports only added/skipped counts** — `src/app/useSyncAll.ts:27-34` vs `src/lib/sync.ts:104-111`; modified/removed data exists but isn't surfaced, so update/delete-only syncs report "+0 added" with no other signal.
- **Reward-rate cells carry no unit** — `TransactionTable.tsx:53-65` renders a bare number, relying entirely on the column header (`Cashback %` vs `Multiplier`, line 92); ambiguous in any other context (screenshot, copy-paste, future export).
- **Metadata overstates current capability** — `src/app/layout.tsx:5` claims "Spending optimization through credit card rewards"; the README's "tracks which reward category each purchase earned" is the accurate framing.
- **Stale card header after partial poll failure** — `src/app/accounts/[accountId]/useAccountData.ts:33-38`; display-only and self-healing.
- **Seed pipeline never sanity-checks the `rate` value** — `scripts/seed-cards.ts:36-74` validates names/slugs but not the rate itself.
- **`unofficial_currency_code` dropped at ingest** — `src/lib/plaid.ts:157,169`; narrow impact today (also raised under Compatibility).
- **Unsupported-account remediation is developer-only** — `src/app/accounts/[accountId]/page.tsx:154-157` points to editing `cards.seed.ts` + CLI; consistent with `card-catalog-in-code.md`, fine while user == developer.
