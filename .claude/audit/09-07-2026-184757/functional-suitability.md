---
characteristic: "functional suitability"
---
# Summary

Four auditors reviewed the codebase against ISO/IEC 25010:2023 §3.1. All four respected the recorded deliberate deferrals (reward aggregation/computation, cap/tier modeling, single-card catalog, deferred tests) and none found a Major concern. Core business logic — the category-kind sign rule (enforced redundantly at the DB level via the `transactions_category_kind_sign_ck` check constraint, `src/db/schema.ts:141-144`), pending-to-posted carry-forward, upsert conflict handling, account/card matching, seed reconciliation, pagination bounds, and encryption round-tripping — was probed independently and found to match its documented design exactly. One auditor found nothing at all beyond an FYI-level design-record wording drift.

One Moderate concern was found (in the post-link user-facing status message), plus a small set of Minor completeness gaps in user-facing feedback.

# Major Concerns

None.

# Moderate Concerns

- **Post-link failure notice is factually wrong for the enrichment-failure path** — `src/app/PlaidLinkButton.tsx:77-79` renders any `sync_error` under the fixed prefix "Connected, but the first sync didn't finish: ". But `linkItem` (`src/lib/link.ts`) populates that field from two distinct failure sources: `runInitialSync` (~lines 107-125), where the prefix is accurate, and the newer enrichment-failure catch block (~lines 166-181), where `getItem`/`getAccounts`/`storeItem` failed *before any sync was attempted* (returns early with `accountsStored: 0`, `sync: null`). In the second case the composed message reads "Connected, but the first sync didn't finish: Linking finished but account setup failed — sync again, or remove the institution." — self-contradictory and inaccurate (no sync ran, no accounts were stored). The frontend copy was written for `initial-sync-reported-not-thrown` and never updated when `link-enrichment-reported-not-thrown` added the second failure source. A second auditor independently found the same mislabeling (transaction sync can complete cleanly while an account-store failure gets framed as "the first sync didn't finish"). It surfaces at the high-trust moment of connecting a new bank.

# Minor Concerns

- **Sync-complete status omits `modified`/`removed` counts** (flagged by 2/4 auditors) — `src/app/useSyncAll.ts:27-34` reports only `+N added` (plus skipped/dropped), while `SyncItemResult` (`src/lib/sync.ts:17-26`) carries `modified` and `removed`, which are read nowhere else. An update-only or delete-only sync shows no visible signal that data changed. No design record sanctions this as intentional.

- **Home page gives no visual cue for unmatched/"unsupported" accounts** (1/4) — `src/app/page.tsx` (`AccountsTable`, lines 29-61) renders every account with no indication whether it resolved to a card; "Card not supported" only appears after navigating into `src/app/accounts/[accountId]/page.tsx`. A user scanning the home page can't tell which accounts SpendRight can actually categorize. Distinct from `unmatched-is-temporary.md`, which addresses *why* an account can be unmatched, not whether the list should say so.

- **Reward-rate cells carry no unit in the value itself** (1/4) — `src/app/accounts/[accountId]/TransactionTable.tsx:65-77` renders a bare number; the cashback-% vs. multiplier distinction lives only in the column header. Sanctioned by `card-type-decides-rate-unit.md`, so not a spec violation — a functional-appropriateness rough edge outside the table's context (screenshots, copy/paste, future export).

- **"Unsupported account" remediation text presumes only a name-mismatch cause** (1/4) — `src/app/accounts/[accountId]/page.tsx:171-177` tells the user to add the account name to `cards.seed.ts`, but per `categories-retired-not-deleted.md` the same view is reached when the card itself was retired, where the correct fix is re-adding the card. Low practical impact at the current catalog state.

- **Design-record wording drift (FYI, not a defect)** (1/4) — `category-kind-sign-rule.md` describes `categoryKindSources` as pairing "each kind's table with its id column," but `src/lib/category-kind-sources.ts` only carries `table` and `retiredPickMessage`; callers access `table.id` generically. Functionally correct.
