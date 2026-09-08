---
characteristic: "functional suitability"
---
# Summary

Four auditors independently re-verified the prior audit (09-07-2026-211746) and swept the sync pipeline, categorization, card matching, item lifecycle, pagination, money formatting, and API routes. All four confirmed the same five prior Minor concerns remain unaddressed, and that the previously-resolved Moderate (self-contradictory post-link failure notice) remains fixed via the `setupFailed`/`setup_failed` threading. One auditor surfaced a new Moderate: a second, uncovered path by which the post-link status prefix can misstate what happened — in the same code area the earlier fix addressed.

Totals: 0 Major, 1 Moderate (new), 5 Minor (all prior).

# Major Concerns

None.

# Moderate Concerns

- `[new]` **"Connected, but the first sync didn't finish" notice is also wrong when only account storage failed, not the sync.** `src/app/PlaidLinkButton.tsx:41-52` — when `data.setup_failed` is `false`, the fixed prefix is applied to *any* non-empty notice list, including one built solely from `account_errors`. Those come from `refreshItemAccounts`'s per-account `storeFailures` (`src/lib/accounts.ts:79-99`), a step that runs before and independently of the initial sync (`src/lib/link.ts:186-198`). If the sync completes cleanly while an account fails to store, the user sees "Connected, but the first sync didn't finish: 1 account(s) not stored…" — misstating what occurred. Same class of bug as the one fixed for `setup_failed` (see `link-flow.md`, "Link enrichment reported, not thrown"), but that fix didn't cover this path. (Flagged by 1 of 4 auditors; verified with concrete code trace.)

# Minor Concerns

- `[prior]` **Sync-complete status omits `modified`/`removed` counts.** `src/app/useSyncAll.ts:27-34` reports only `+N added` (plus skipped/dropped); `SyncItemResult.modified`/`.removed` (`src/lib/sync.ts:17-26`) are populated but never surfaced. An update-only or delete-only sync gives no visible signal anything changed. (Flagged by all 4 auditors.)

- `[prior]` **Home page gives no visual cue for unmatched/"unsupported" accounts.** `AccountsTable` in `src/app/page.tsx:30-64` renders every account identically regardless of card-match status; "Card not supported" only surfaces on the account detail page (`src/app/accounts/[accountId]/page.tsx:171-178`). (Flagged by all 4 auditors.)

- `[prior]` **Reward-rate cells carry no unit in the value itself.** `rateCellText` (`src/app/accounts/[accountId]/TransactionTable.tsx:66-78`) renders a bare number; the cashback-% vs. multiplier distinction lives only in the column header. Sanctioned by `card-type-decides-rate-unit.md` for in-table display — a rough edge rather than a spec violation. (Flagged by all 4 auditors.)

- `[prior]` **"Unsupported account" remediation text presumes only a name-mismatch cause.** `src/app/accounts/[accountId]/page.tsx:171-178` tells the user only to add the account name to `cards.seed.ts`; per `categories-retired-not-deleted.md`, the same view is reached when the card was retired, where the correct fix is re-adding the card. (Flagged by all 4 auditors.)

- `[prior]` **Design-record wording drift (FYI-level).** `category-kind-sign-rule.md` describes `categoryKindSources` as pairing "each kind's table with its id column," but `src/lib/category-kind-sources.ts:5-8` carries only `table` and `retiredPickMessage`. Documentation wording only; the code is correct. (Flagged by all 4 auditors.)
