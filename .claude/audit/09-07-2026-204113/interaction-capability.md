---
characteristic: "interaction capability"
---
# Summary

The interaction layer has not regressed but nothing prior has been fixed: all 3 Moderate and 11 Minor concerns from the last audit remain open, verified against an unchanged source tree by all four auditors. Two new concerns surfaced (one Moderate, one Minor), each from one auditor's independent pass with concrete, unrebutted evidence. The accepted design carve-outs (`unstyled-for-now`, `operator-is-developer`, `async-status-announced`, `confirm()` for deletion) remain respected and correctly scoped, and the per-row category-edit flow remains the codebase's own proof that correctly-scoped async state is a solved pattern here — the recurring theme is that the institution-removal flow and monetary/date presentation lag behind it.

# Major Concerns

None.

# Moderate Concerns

- `[prior]` **Removing one institution disables and mislabels the "Remove" control for every other institution.** `src/app/page.tsx:161` passes a single page-wide `removing` boolean (from `useItemRemoval` via `useAsyncAction`'s single `pendingCount`, `src/hooks/useAsyncAction.ts:13,52`) as `removePending` to every `InstitutionSection` — removing institution A disables B's button and announces B's `role="status"` as "Removing…". A failed removal renders one generic, unattributed "Failed to remove item" that never names the institution. `useCategoryPatches` shows the correct per-key pattern. (Flagged by all 4 auditors; also raised as a functional-correctness issue.)
- `[prior]` **Monetary values render as raw, unlocalized numbers; the home page has no currency column.** `AccountsTable` (`src/app/page.tsx:51-53`), `AccountIdentity` (`src/app/accounts/[accountId]/page.tsx:54-57`), and `TransactionTable.tsx:145` print bare numeric strings — no `Intl.NumberFormat`, thousands separators, or fixed rounding anywhere in the codebase — and `isoCurrencyCode` is never shown on the home page. No design record accepts this gap, which is consequential for a finance tool. (Flagged by all 4 auditors.)
- `[prior]` **Missing balances render as ambiguous blank cells on the home page.** Nullable balance fields (`src/lib/provider-types.ts:11-13`) render directly in `AccountsTable` with no fallback — `null` is indistinguishable from zero or still-loading — while the account detail page explicitly falls back to `'—'`. (Flagged by all 4 auditors.)
- `[new]` **Retry gives no perceivable feedback while in flight on both main pages.** `useLoadProtocol` exposes a `reloading` flag (`src/hooks/useLoadProtocol.ts:53,105-110`) but only `useTransactionPage.ts:50` consumes it; neither `useHomeData` nor `useAccountData` surfaces it, and `ErrorNotice`'s Retry button (`src/components/ErrorNotice.tsx:18`) is never disabled and has no `role="status"` update during the retry. This contradicts `async-status-announced.md`'s commitment that every async operation's start/success/failure is exposed to screen readers. (Flagged by 1 of 4 auditors.)

# Minor Concerns

- `[prior]` **Item-error fallback can surface raw JSON.** `src/lib/item-error-message.ts:6` falls back to `JSON.stringify(error)` for non-allow-listed error shapes.
- `[prior]` **`confirm()` text doesn't name the institution being removed.** `src/app/useItemRemoval.ts:25` uses one generic message; `institutionName` is in scope but unused.
- `[prior]` **No announced success confirmation for institution removal.** "Removing…" reverts to `null` with no persisted success text, unlike `useSyncAll`'s "Sync complete…" pattern — silent success is indistinguishable from unannounced failure for a screen-reader user.
- `[prior]` **No focus management after destructive removal.** Removing an institution unmounts the focused button's section with no focus redirection (no `focus()`/ref handling anywhere in `src/`).
- `[prior]` **Interactive controls nested inside a heading.** `src/app/page.tsx:80-91` — the logo `<img>` and "Remove" `<button>` sit inside the `<h2>`.
- `[prior]` **Labels fall back to raw internal IDs.** `item.institutionName ?? item.itemId` (`page.tsx:85`) and `name ?? officialName ?? accountId` (`src/lib/account-display.ts:8`).
- `[prior]` **Data tables lack `<caption>`/accessible names.** No `aria-labelledby`/`<caption>` anywhere; multiple `AccountsTable` instances are distinguishable only by unassociated visual headings.
- `[prior]` **Error boundaries offer no path back to a known-good route.** `error.tsx`/`global-error.tsx` offer only Retry; `not-found.tsx` shows the link-home pattern.
- `[prior]` **Disabled controls don't expose their reason.** "Sync all" (`page.tsx:133`) and the stale-category `<select>`s (`TransactionTable.tsx:154`) have no `aria-describedby` tying them to explanatory text.
- `[prior]` **No first-run orientation.** One-line empty state plus a button; tracked against the `operator-is-developer` revisit trigger.
- `[prior]` **Transaction dates rendered as raw strings.** `TransactionTable.tsx:142` shows `txn.date` raw while sibling timestamps use `toLocaleString()`.
- `[new]` **"Remove" and "Fix connection" buttons have non-unique accessible names across institutions.** `page.tsx:86-88` and `RepairConnectionButton.tsx:35-37` carry no `aria-label` naming the institution, so a rotor/controls listing shows identical "Remove"/"Fix connection" entries with no way to tell them apart — and moving them out of the `<h2>` wouldn't fix it. `CategorySelect`'s `ariaLabel` (`TransactionTable.tsx:155`) shows the established fix pattern. (Flagged by 1 of 4 auditors.)
