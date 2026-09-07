---
characteristic: "interaction capability"
---
# Summary

Five auditors reviewed the UI surface (`src/app/**`, `src/components`, `src/hooks`) against ISO/IEC 25010:2023 §3.4. All correctly excluded the deliberate `unstyled-for-now.md` decisions (no CSS, plain tables, native `<select>`, `confirm()` appearance) and the single-user/localhost posture. The shared baseline assessment is positive: the app leans on native, keyboard-accessible HTML controls, and every async action (connect, sync, remove, paginate, categorize) has an inline pending/error state via `useAsyncAction`/`useLoadProtocol`.

The dominant, near-unanimous finding is that the app is entirely silent to assistive technology: a repo-wide search confirms zero uses of `aria-live`, `role="status"`, or `role="alert"`, in a UI whose core model is asynchronous (background 60s polling, multi-step Plaid Link, optimistic category writes). One auditor also flagged the missing Plaid re-auth path as the top interaction gap (it doubles as a Reliability finding).

# Major Concerns

- **No assistive-tech announcement of any async state change** (flagged by 5 of 5 auditors; rated Major by 2) — zero `aria-live`/`role="status"`/`role="alert"` anywhere in `src/`. Affected surfaces: `src/components/ErrorNotice.tsx:12-24` (the shared error component used for every error in the app), `src/app/PlaidLinkButton.tsx:88-95` (connect/exchange progress), `src/app/page.tsx:125` (sync status), `src/app/accounts/[accountId]/page.tsx:88` (pager "Loading…"), `TransactionTable.tsx:147` ("Update failed"). A screen-reader user who triggers connect, sync, or a category edit has no way to know the operation started, succeeded, or failed. This is the app's core task loop, and it excludes an entire user population (WCAG status-messages criterion), independent of the styling exemption.

- **No repair path for a broken bank connection** (flagged by 1 of 5 here; corroborated independently by two Reliability auditors) — `src/lib/plaid.ts:115-126` never uses Plaid Link update mode, so when an institution errors the only user options are "Connect a bank" (creates an unrelated new item) or "Remove" (deletes all history). Re-authenticating an existing connection without data loss is impossible.

# Moderate Concerns

- **The category `<select>` — the app's primary control — has no accessible name** (4 of 5) — `TransactionTable.tsx:26-51`; only naming cue is the `<th>Category</th>` column header, which screen readers don't reliably associate when tabbing through form controls. A one-line `aria-label` (e.g. `Category for ${txn.name}`) fixes it.
- **Identical, context-free "Remove" buttons per institution** (3 of 5) — `src/app/page.tsx:87`; with multiple institutions, a destructive control is indistinguishable by accessible name.
- **User-facing copy points to resources the app never exposes** (4 of 5) — "check the server log" (`src/lib/sync-messages.ts:13-28`, surfaced via `useSyncAll.ts:31` and `PlaidLinkButton.tsx:45,94`) and "edit `src/db/cards.seed.ts` and re-run `npm run seed:cards`" (`accounts/[accountId]/page.tsx:152-159`). Self-descriptiveness gap; acceptable while user == developer, but worth tracking.
- **No error boundary or not-found page** (2 of 5; also a Reliability finding) — no `src/app/error.tsx`, `global-error.tsx`, or `not-found.tsx`; an uncaught render exception blanks the route to Next's default screen with none of the app's own retry affordances.
- **No locale/currency formatting on monetary values, and the sign convention is unexplained** (3 of 5) — raw numbers at `src/app/page.tsx:53-55`, `accounts/[accountId]/page.tsx:53-57`, `TransactionTable.tsx:133-134` despite `isoCurrencyCode` being available; positive-means-purchase is never explained in the UI.
- **Native `confirm()` for a destructive, irreversible removal with no richer safeguard** — `src/app/useItemRemoval.ts:20-23`; the styling exemption covers its appearance, but nothing shows affected-row counts or requires stronger confirmation for deleting an institution's full history.
- **Static document title across all routes** (2 of 5) — `src/app/layout.tsx:3-6`; tabs/bookmarks indistinguishable.
- **Fallback error text can surface raw JSON** — `src/app/page.tsx:16-19` falls back to `JSON.stringify(error)` (`src/lib/plaid-errors.ts:33-38`).
- **No on-page orientation for first-time users** (2 of 5) — `src/app/page.tsx:114-127` shows only a heading and button; the product description lives only in `<head>` metadata.

# Minor Concerns

- Tables lack `<caption>` and `<th scope="col">` — `page.tsx:34-44`, `TransactionTable.tsx:98-120`.
- Institution logo has `alt=""` despite carrying identifying information — `page.tsx:79-84`.
- Silent 60s background refresh can change data mid-review with no cue — `useVisiblePoll.ts:6-22` (deliberate feature; nit).
- Stale category selection shows an unexplained "unavailable" option — `TransactionTable.tsx:39-43`.
- Inconsistent missing-balance rendering: blank cell (`page.tsx:53-55`) vs `'—'` (`accounts/[accountId]/page.tsx:53-56`).
- No currency column on the home accounts table, unlike the account page — `page.tsx:32-61`.
- Institution name can fall back to a raw item ID — `page.tsx:86`.
- Disabled "Sync all" gives no reason via `title`/`aria-label` — `page.tsx:122`.
- No "saving…" state during category-edit PATCH — `useCategoryPatches.ts:71-104`.
- Fixed `lang="en"`, English-only copy — `layout.tsx:10`.
- Fixed-layout 8-column table has no horizontal-scroll container for narrow viewports — `TransactionTable.tsx:98`.
- Status text renders inline next to the button with identical emphasis; sighted users can also miss transitions — `page.tsx:122-126`.
- Flat category `<select>` will get hard to scan as the catalog grows — `TransactionTable.tsx:26-50`.
