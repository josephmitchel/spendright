---
characteristic: "functional suitability"
---
# Summary

All four auditors converged: no Major concerns, one Moderate and five Minor concerns — every one prior and unaddressed since 09-07-2026-184757 (the source tree is unchanged since that audit; intervening commits touched only audit tooling). Core business logic (sync diff/upsert/cursor flow, account/card matching, category-kind sign rule, pending-to-posted carry-forward, pagination, optimistic category writes, item removal/repair) was independently re-traced by all four agents and matches the recorded design decisions exactly. One agent re-raised the shared page-wide "removing" flag as a functional-correctness issue (inaccurate status output); that defect is the same code issue already tracked as a prior Moderate under interaction capability, so it is scored there and only cross-referenced here.

# Major Concerns

None.

# Moderate Concerns

- `[prior]` **Post-link failure notice is factually wrong for the enrichment-failure path.** `src/app/PlaidLinkButton.tsx:77-79` hardcodes the prefix "Connected, but the first sync didn't finish: " around any `sync_error`, but `linkItem` (`src/lib/link.ts:166-181`) also populates that field from the enrichment-failure branch, which returns before any sync attempt (`accountsStored: 0`, `sync: null`). The composed message ("Connected, but the first sync didn't finish: Linking finished but account setup failed…") is self-contradictory, at the highest-trust moment in the app (first connecting a bank). (Flagged by all 4 auditors.)

*Cross-reference (not scored here):* the page-wide `removing` flag announcing "Removing…" on institutions that aren't being removed (`src/hooks/useAsyncAction.ts:13,52`, `src/app/page.tsx:161`) is also a functional-correctness defect in status output; it is tracked as a `[prior]` Moderate in `interaction-capability.md`.

# Moderate Concerns

# Minor Concerns

- `[prior]` **Sync-complete status omits `modified`/`removed` counts.** `src/app/useSyncAll.ts:30` reports only `+N added` (plus skipped/dropped); `SyncItemResult.modified`/`.removed` (`src/lib/sync.ts:17-26`) are populated but surfaced nowhere. An update-only or delete-only sync gives no visible signal that anything changed.
- `[prior]` **Home page gives no visual cue for unmatched/"unsupported" accounts.** `AccountsTable` (`src/app/page.tsx:29-61`) renders every account identically regardless of card-match status; "Card not supported" only appears on the account detail page (`src/app/accounts/[accountId]/page.tsx:171-177`).
- `[prior]` **Reward-rate cells carry no unit in the value itself.** `rateCellText` (`src/app/accounts/[accountId]/TransactionTable.tsx:65-77`) renders a bare number; the cashback-% vs. multiplier distinction lives only in the column header. Sanctioned by `card-type-decides-rate-unit.md` for in-table display — a rough edge for out-of-context views (copy/paste, screenshots, future export), not a spec violation.
- `[prior]` **"Unsupported account" remediation text presumes only a name-mismatch cause.** `src/app/accounts/[accountId]/page.tsx:171-177` tells the user only to add the account name to `cards.seed.ts`; per `categories-retired-not-deleted.md` the same view is also reached when the card was retired, where the fix is re-adding the card.
- `[prior]` **Design-record wording drift (FYI-level).** `category-kind-sign-rule.md` describes `categoryKindSources` as pairing "each kind's table with its id column," but `src/lib/category-kind-sources.ts` carries only `table` and `retiredPickMessage`. Functionally correct; documentation wording only.
