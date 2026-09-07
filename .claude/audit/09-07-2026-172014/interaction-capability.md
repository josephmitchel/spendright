---
characteristic: 'interaction capability'
---

# Summary

Four independent auditors reviewed the UI layer (`src/app/**`, `src/components/**`, `src/hooks/**`) against ISO/IEC 25010:2023 §3.4, all cross-checking `.claude/design/current/` to avoid re-flagging deliberate decisions (unstyled UI, `confirm()` for deletion, error-message allow-list, polling, no-auth, live-region async status pattern — none re-litigated here). All four found the app's core interactions well handled: keyboard-operable native elements, deliberate async status/error announcement (`async-status-announced`), per-read retry (`partial-load-rendering`), and stale-data edit disabling. **No major findings.** The one unanimous finding — the category `<select>` lacking an accessible name — is notable precisely because the codebase otherwise treats accessibility as a deliberate focus area.

# Major Concerns

None.

# Moderate Concerns

- **Category `<select>` controls have no accessible name** (`src/app/accounts/[accountId]/TransactionTable.tsx`, `CategorySelect`, lines 12-51) — flagged by all 4 auditors. Each row's category picker is a bare `<select>` with no `<label>`, `aria-label`, or `aria-labelledby`; a repo-wide grep confirms zero `aria-*` attributes and zero `<label>` elements anywhere in `src/`. A screen-reader user tabbing through controls hears an unlabeled combobox per row with no indication of which transaction it edits — on the app's primary interactive control. Fix suggested: `aria-label={`Category for ${txn.name}`}` or similar per-row label.
- **No React error boundary anywhere in the App Router** — no `error.tsx`/`global-error.tsx` under `src/app` (2 auditors). Fetch-level failures are handled deliberately, but any uncaught render-time exception blanks the route to Next's default crash screen with no in-app retry or recovery path, inconsistent with the care taken elsewhere.
- **Initial "Loading…" text isn't announced to screen readers** (`src/app/page.tsx:139`, `src/app/accounts/[accountId]/page.tsx:148`) — the top-level loading state is a conditionally-mounted plain `<p>` with no role, contradicting the app's own confirmed `async-status-announced` rule that status regions must exist before their text appears.
- **Sync failure messages identify connections by opaque Plaid `itemId`** (`src/app/useSyncAll.ts:29`) — the `role="status"` sync line renders `` `${result.itemId}: ${result.error}` `` while everywhere else the same connection is shown by `institutionName`; the user can't map the failure back to an institution.
- **User-facing messages embed developer remediation steps** (`src/app/accounts/[accountId]/page.tsx:~157` — "edit `src/db/cards.seed.ts` and run `npm run seed:cards`"; `src/lib/sync-messages.ts` — "check the server log") — workable while user == maintainer, but not covered by any design record as an intentional interaction pattern.
- **Table headers lack `scope="col"` (and tables lack `<caption>`)** (`src/app/page.tsx` `AccountsTable` lines 33-62; `TransactionTable.tsx` lines 97-120) — flagged by 2 auditors (one moderate, one minor). Breaks reliable header-to-cell association for screen-reader table navigation (WCAG 1.3.1) on the app's core data surfaces; semantic markup is outside `unstyled-for-now`'s visual-styling carve-out.

# Minor Concerns

- **No dynamic per-page document title** (`src/app/layout.tsx`; `accounts/[accountId]/page.tsx`) — flagged by 2 auditors. One static `SpendRight` title for every route; multiple account tabs and history entries are indistinguishable and route changes give no orientation cue.
- **No focus management after destructive DOM removal** (`src/app/useItemRemoval.ts`) — removing an institution removes the focused button's whole `<section>`; focus silently falls to `<body>`.
- **Interactive controls nested inside a heading** (`src/app/page.tsx`, `InstitutionSection`, lines 78-91) — the logo `<img>` and destructive Remove `<button>` live inside the `<h2>`, so heading navigation reads "InstitutionName Remove" as one heading.
- **Generic `confirm()` text doesn't name the institution being removed** (`src/app/useItemRemoval.ts:21`) — with multiple institutions the dialog gives no evidence the right one was targeted before an irreversible delete (the use of `confirm()` itself is deliberate per `unstyled-for-now`; this is only about message content).
- **Money values rendered as raw floats** (`src/app/accounts/[accountId]/page.tsx:44-60`, `AccountsTable`) — balances/amounts print as bare numbers with the ISO code as separate text rather than `Intl.NumberFormat` currency formatting; data formatting is not covered by the `unstyled-for-now` visual carve-out.
- **No `not-found.tsx`** — bad routes fall through to Next's generic 404 with no link back to `/`.
- **Client-side error fallback can render raw JSON** (`src/app/page.tsx:17-20`) — `itemErrorMessage` falls back to `JSON.stringify(error)` for unrecognized shapes, the exact leak the `error-message-allow-list` design exists to prevent.
- **Institution section falls back to a raw internal ID as its heading** (`src/app/page.tsx:89`) — `item.institutionName ?? item.itemId` shows Plaid's opaque `item_id` if the name is absent.
- **No `viewport` metadata export** (`src/app/layout.tsx`) — can leave mobile browsers rendering the desktop layout scaled down; behavioral rather than visual, so not covered by `unstyled-for-now`.
- **Sync-complete status omits `modified`/`removed` counts** (`src/app/useSyncAll.ts:27-34`) — an update-only sync reports "+0 added" with no other signal (also raised under Functional Suitability).
