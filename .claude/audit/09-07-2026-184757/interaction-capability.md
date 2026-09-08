---
characteristic: "interaction capability"
---
# Summary

Four auditors reviewed the codebase against ISO/IEC 25010:2023 §3.4. All four confirmed the prior round's fixes are live (item-error banner through `ErrorNotice` with `role="alert"`, removal pending feedback, dynamic per-account `document.title`, `not-found.tsx` with a link home) and that the recorded carve-outs (`unstyled-for-now`, `operator-is-developer`, `confirm()` for deletion, the `async-status-announced` live-region pattern) are respected throughout. The interaction layer is mature for its stage: consistent live regions on every async operation, disabled-not-hidden stale controls, partial-load rendering that never blanks working content, and all-native interactive elements.

Three Moderate concerns stand out. One is a regression introduced by the prior round's own fix (page-wide removal pending state); two concern monetary data presentation, which multiple auditors emphasized is a data-presentation gap *not* covered by the `unstyled-for-now` styling carve-out — significant for an app whose purpose is reading financial data correctly.

# Major Concerns

None.

# Moderate Concerns

- **Removing one institution disables and mislabels the "Remove" control for every other institution** (1/4, verified in detail) — `src/app/page.tsx` passes a single `removing` boolean from `useItemRemoval` as `removePending` to every `InstitutionSection`, and `useAsyncAction` (`src/hooks/useAsyncAction.ts:13,52`) tracks `pending` as one page-wide counter even though it tracks errors per key. With two institutions connected, removing A disables B's button and shows B's `role="status"` as "Removing…". This is a regression introduced by the fix for the prior "no pending feedback" finding — correct for the single-item case, broken for multi-item. Contrast `useCategoryPatches`, which correctly scopes pending state per row. Relatedly, a failed removal renders one generic, unattributed error banner at the top of the page (`useAsyncAction`'s error getter joins all per-key errors; the message itself — "Failed to remove item" — never names the institution), so the user can't tell which institution failed.

- **Monetary values render as raw, unlocalized numbers** (4/4) — `src/app/page.tsx` (`AccountsTable`), `src/app/accounts/[accountId]/page.tsx` (`AccountIdentity`), and `TransactionTable.tsx:145` all print bare numeric strings (e.g. `1234.560000`) with no `Intl.NumberFormat`, no thousands separators, and no fixed rounding. Worse, the home page's `AccountsTable` has **no currency column at all** — `isoCurrencyCode` exists on the same `ApiAccount` type and is shown on the account detail page, but a home-page balance carries no currency context. Misreading a balance's magnitude or currency has real consequences in a finance tool; no design record accepts this.

- **Missing balances render as ambiguous blank cells on the home page** (1/4) — the balance columns are nullable (`src/lib/provider-types.ts:11-13`), and `AccountsTable` renders them directly, so `null` becomes an empty cell — indistinguishable from loading or zero — while the account detail page explicitly renders `?? '—'` for the same fields (`src/app/accounts/[accountId]/page.tsx:54-57`). An inconsistency in how the two views handle the same data.

# Minor Concerns

- **Item-error fallback can surface raw JSON** (2/4) — `src/lib/item-error-message.ts:6` falls back to `JSON.stringify(error)` when a Plaid error doesn't match the allow-listed shape; reachable since `ItemErrorBody`'s fields are optional.

- **`confirm()` text doesn't name the institution being removed** (3/4) — `src/app/useItemRemoval.ts:25` uses the same generic message for every item; with multiple institutions, the irreversible-delete dialog gives no evidence the right one is targeted. (`confirm()` itself is the accepted pattern; this is message content, and `institutionName` is already available.)

- **No announced success confirmation for institution removal** (1/4) — `async-status-announced.md`'s contract is start/success/failure; `useSyncAll` honors it with a persistent "Sync complete…" message, but `useItemRemoval` only shows "Removing…" then reverts to null. DOM removal is not reliably announced; to a screen-reader user, silence could equally mean failure.

- **No focus management after destructive removal** (2/4) — removing an institution unmounts the section containing the focused button; focus silently falls to `<body>`.

- **Interactive controls nested inside a heading** (2/4) — `src/app/page.tsx:80-91`: the logo `<img>` and "Remove" `<button>` sit inside the `<h2>`, so heading navigation announces "InstitutionName Remove" as heading text.

- **Labels fall back to raw internal IDs** (2/4) — `src/app/page.tsx:85` (`institutionName ?? itemId`) and `src/lib/account-display.ts:8` (`name ?? officialName ?? accountId`); an opaque Plaid ID is not a recognizable label.

- **Data tables lack `<caption>`/accessible names** (3/4) — `AccountsTable` and `TransactionTable` have `scope="col"` headers but no programmatic table name; on the home page multiple `AccountsTable` instances are distinguished only visually by the preceding `<h2>`. Cheap fix: `aria-labelledby` pointing at the heading.

- **Error boundaries offer no path back to a known-good route** (2/4) — `src/app/error.tsx` and `global-error.tsx` offer only Retry; unlike `not-found.tsx`, a persistently erroring route leaves no link home.

- **Disabled controls don't expose their reason** (1/4) — the "Sync all" button is silently disabled with no institutions (`page.tsx:133`), and the stale-category explanation paragraph isn't linked to the disabled `<select>`s via `aria-describedby` (`TransactionTable.tsx:154`, account page line 184).

- **No first-run orientation** (2/4) — the empty state is one line plus a button, with all product context living in `README.md`. Likely in the spirit of the `operator-is-developer` stage; worth tracking against the same revisit triggers.

- **Transaction dates rendered as raw strings** (1/4) — `TransactionTable.tsx:142` shows `txn.date` raw while sibling timestamps use `toLocaleString()`; a small presentation inconsistency.
