---
characteristic: 'interaction capability'
---

# Summary

Three auditors reviewed the full interactive surface (pages, hooks, live regions, error messaging, keyboard/screen-reader operability) against the snapshot's blessed scope (deliberately unstyled, `confirm()` for destructive actions, only the live-region and money-formatter rules as binding obligations). The interaction layer is unusually disciplined: live-region conventions applied uniformly, per-row `aria-label`s, native controls, no focus-outline suppression, clear failure-path messaging. The findings cluster around the institution-removal flow and a few consistency gaps in the transaction table. All findings are `[new]` (first audit of the era).

# Major Concerns

None.

# Moderate Concerns

- `[new]` **Institution-removal errors aren't collocated with the row that caused them.** `src/app/page.tsx:~148-153` renders `removeError` as a single top-of-page notice, while every other error surface in the app is deliberately inline with its trigger (item errors inside `InstitutionSection`, category-patch errors in the transaction's own row, Link/repair errors next to their buttons). `useItemRemoval.ts` tracks per-item pending state but aggregates all concurrent failures into one `; `-joined string, so with multiple institutions a failed removal surfaces as a disconnected blob that doesn't map errors to rows — breaking the app's own established self-descriptiveness convention.

# Minor Concerns

- `[new]` **No focus management or lasting confirmation after a successful institution removal.** `src/app/page.tsx` (`InstitutionSection`, ~lines 88-108) + `src/app/useItemRemoval.ts`: on success the entire section — including the "Remove" button and its `role="status"` "Removing…" text — unmounts; keyboard/screen-reader focus silently drops to `<body>` with no announcement that the removal completed. Every other mutating action reports its outcome through a permanently mounted live region; success here is communicated only by silent row disappearance. Suggested: move focus to the "Connect a bank" button or list heading after removal. (Raised independently by two auditors.)

- `[new]` **Inconsistent "no value" rendering in the transaction table.** `src/app/accounts/[accountId]/TransactionTable.tsx`: the rate column (`rateCellText`, lines 64-76) renders `'—'` for rate-less credit rows but returns raw `null` (an empty cell) for an uncategorized card row, and nullable `merchantName`/`name` columns likewise render as bare empty cells. This contradicts the app's own convention — `src/lib/money.ts` deliberately renders `'—'` for null "so missing never reads as zero." Blank cells read ambiguously (loading glitch? bug? no value?). One-line fixes per cell.

- `[new]` **Transaction-list pagination state isn't reflected in the URL.** `src/app/accounts/[accountId]/useTransactionPage.ts` keeps the page in `useState(0)`; refresh or back-navigation always resets to page 0, and a specific page can't be bookmarked or recovered. A conformity-with-expectations nit given the app's otherwise minimal routing.
