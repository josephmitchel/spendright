---
characteristic: "functional suitability"
---
# Summary

All four auditors agree unanimously. The one open Moderate from the prior audit — the self-contradictory post-link failure notice — has been genuinely fixed in commit `da6bbb8`: `linkItem` now carries `setupFailed`, threaded through `ExchangeResponse.setup_failed` (`src/lib/link.ts`, `src/app/api/exchange/route.ts:22`, `src/lib/api-types.ts:91`), and `PlaidLinkButton.tsx:48-53` omits the misleading "Connected, but the first sync didn't finish:" prefix on the enrichment-failure path. Every auditor traced the fix end-to-end and confirmed it complete.

The remaining backlog is five long-standing Minor gaps, all prior, none touched by the latest commit. Independent fresh passes over the sync pipeline, categorization, account/card matching, item lifecycle, pagination, money formatting, and the seed script found no new defects — behavior matches the recorded design decisions in every case checked. One candidate (sync-outcome error precedence) was ruled out as a false positive because `accounts-refreshed-per-sync.md` documents the precedence rule deliberately.

Totals: 0 Major, 0 Moderate (1 prior resolved this cycle), 5 Minor (all prior, 0 new).

# Major Concerns

None.

# Moderate Concerns

None open. `[prior — resolved]` The post-link failure notice contradiction was fixed via the `setupFailed`/`setup_failed` threading described above.

# Minor Concerns

- `[prior]` **Sync-complete status omits `modified`/`removed` counts.** `src/app/useSyncAll.ts:27-34` reports only `+N added` (plus skipped/dropped); `SyncItemResult.modified`/`.removed` (`src/lib/sync.ts:17-26`) are populated but never surfaced. An update-only or delete-only sync gives no visible signal that anything changed.
- `[prior]` **Home page gives no visual cue for unmatched/"unsupported" accounts.** `AccountsTable` (`src/app/page.tsx:30-64`) renders every account identically regardless of card-match status; "Card not supported" only appears on the account detail page (`src/app/accounts/[accountId]/page.tsx:172-179`).
- `[prior]` **Reward-rate cells carry no unit in the value itself.** `rateCellText` (`src/app/accounts/[accountId]/TransactionTable.tsx:66-78`) renders a bare number; the cashback-% vs. multiplier distinction lives only in the column header. Sanctioned by `card-type-decides-rate-unit.md` for in-table display — a rough edge for out-of-context views, not a spec violation.
- `[prior]` **"Unsupported account" remediation text presumes only a name-mismatch cause.** `src/app/accounts/[accountId]/page.tsx:172-178` tells the user only to add the account name to `cards.seed.ts`; per `categories-retired-not-deleted.md`, the same view is reached when the card was retired, where the correct fix is re-adding the card.
- `[prior]` **Design-record wording drift (FYI-level).** `category-kind-sign-rule.md` describes `categoryKindSources` as pairing "each kind's table with its id column," but `src/lib/category-kind-sources.ts:5-8` carries only `table` and `retiredPickMessage`. Documentation wording only; the code is correct.
