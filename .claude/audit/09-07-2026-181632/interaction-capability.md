---
characteristic: "interaction capability"
---
# Summary

Four auditors assessed interaction capability (ISO/IEC 25010:2023 §3.4) across `src/app/**`, `src/components/**`, and `src/hooks/**`. The prior round's accessibility fixes were verified in code (aria-label on the category select, `error.tsx`/`global-error.tsx`, `role="status"` loading regions, `scope="col"` headers, `institutionName` in sync-failure lines), and the accepted design carve-outs (`unstyled-for-now`, `operator-is-developer`, `confirm()` for deletion) were respected. One auditor established that the previously-reported "no viewport metadata" finding is a false positive — Next.js 16 injects a default viewport meta tag automatically — so it is dropped. Remaining concerns are consistency gaps against the project's own `async-status-announced` rule and orientation/self-descriptiveness polish.

# Major Concerns

None.

# Moderate Concerns

- **Home-page item-error banner is invisible to assistive tech, unlike every other async surface** (1 auditor) — `src/app/page.tsx` (`InstitutionSection`, ~90-97) renders `items.error` as a bare `<p>Item error: …</p>` with no ARIA role and without `ErrorNotice`, while the account page routes the same error through `<ErrorNotice>` (`src/app/accounts/[accountId]/page.tsx:154`) and `async-status-announced.md` commits every async state change to `role="alert"`/`role="status"`. Since `items.error` can flip from a background poll, a screen-reader user gets zero announcement of a broken connection — an inconsistency the design record's own rule set out to prevent.

- **"Remove" gives no pending feedback, unlike every other mutating action** (1 auditor) — `src/app/useItemRemoval.ts` discards the `pending` flag `useAsyncAction` already computes; the button (`src/app/page.tsx`) is never disabled and has no status region. Removal calls Plaid and takes the per-item sync lock (`item-delete-plaid-first.md`), so it can take seconds with no confirmation the click registered — inviting repeat clicks. Every other mutation follows `async-status-announced.md`.

- **No dynamic per-route document title** (4 auditors; 2 rated moderate) — `src/app/layout.tsx` sets one static `SpendRight` title; the account route (a `'use client'` component) exports no metadata. Tabs, history entries, and screen-reader window announcements are indistinguishable across accounts — significant given the app's own leave-the-tab-open polling model.

- **No `not-found.tsx`** (3 auditors; 1 rated moderate) — a bad or stale URL (e.g. a removed account's link) falls through to Next's generic 404 with no path back into the app.

# Minor Concerns

- **Money values render as raw floats, not localized currency** (3 auditors) — `src/app/page.tsx` (`AccountsTable`) and `src/app/accounts/[accountId]/page.tsx` (`AccountIdentity`) print balances/limits as bare numbers with the ISO code as trailing text instead of `Intl.NumberFormat`. Data formatting, not styling, so outside the `unstyled-for-now` carve-out.

- **Item-error fallback can surface raw JSON to the user** (4 auditors) — `src/lib/item-error-message.ts:6` falls back to `JSON.stringify(error)`. Reachable because the allow-list's fields are optional (`error-message-allow-list.md`); not an information leak (fields are already allow-listed) but a self-descriptiveness violation if it ever renders.

- **`confirm()` text doesn't name the institution being removed** (3 auditors) — `src/app/useItemRemoval.ts:21` uses generic text; with multiple institutions connected, the irreversible-delete dialog gives no evidence the right one is targeted. (`confirm()` itself is the accepted pattern; this is message content only.)

- **No focus management after destructive removal** (3 auditors) — removing an institution unmounts the `<section>` containing the focused button; focus silently falls to `<body>` with no announcement.

- **Interactive controls nested inside a heading** (3 auditors) — `src/app/page.tsx:76-89`: the logo `<img>` and "Remove" `<button>` sit inside the `<h2>`, so screen-reader heading navigation announces "InstitutionName Remove" as a heading.

- **Institution heading falls back to a raw internal `itemId`** (2 auditors) — `src/app/page.tsx:87` (`item.institutionName ?? item.itemId`); an opaque Plaid ID is not a recognizable label.

- **Data tables lack `<caption>`** (3 auditors) — `AccountsTable` and `TransactionTable` now have `scope="col"` headers but no programmatic table name for screen-reader table navigation.

- **Error boundary fallback has no path back to a known-good route** (1 auditor) — `error.tsx`/`global-error.tsx` offer only Retry (`reset()`); a persistent per-route error reproduces with no link back to `/`.

- **Sync-complete status drops `modified`/`removed` counts** (1 auditor here; primary consensus finding in the functional-suitability report) — `src/app/useSyncAll.ts:27-34`.
