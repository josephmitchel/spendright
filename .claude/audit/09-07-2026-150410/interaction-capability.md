---
characteristic: "interaction capability"
---
# Summary

No auditor found a major issue: there are no broken or dead-end interaction paths, the load/error/retry protocol (`src/hooks/useLoadProtocol.ts`) is applied consistently, and all controls are native semantic HTML. All three auditors respected the recorded design decisions (`unstyled-for-now`, `no-category-clear`, `stale-lists-disable-editing`, `single-user-localhost-no-auth`) and did not re-flag styling, `confirm()`, or the no-auth posture. The consistent theme across auditors is accessibility for assistive-technology users (no ARIA anywhere in `src/`) and messages that route the user outside the product to resolve issues.

# Major Concerns

None found by any auditor.

# Moderate Concerns

- **No `aria-live` regions for async status/error text** (flagged by all 3 auditors) — sync status (`src/app/page.tsx:125`), Plaid Link progress/notices (`src/app/PlaidLinkButton.tsx:88–96`), `ErrorNotice` instances, pager "Loading…", and per-row "Update failed: …" (`src/app/accounts/[accountId]/TransactionTable.tsx:147`) all mount/change as plain DOM text with no `aria-live`/`role="status"`/`role="alert"`. Screen-reader users get no announcement when a sync completes, fails, or a background poll refreshes data — this touches every core workflow (connect, sync, categorize).
- **No accessible-name association for form controls** (2 auditors) — the per-row category `<select>` in `TransactionTable.tsx` has no `<label>`/`aria-label`; its relationship to the "Category" column header is conveyed only visually. A repo-wide grep for `aria-`, `role=`, `<label`, `htmlFor` returns nothing.
- **User-facing messages terminate outside the product** (2 auditors) — the unsupported-account view (`src/app/accounts/[accountId]/page.tsx:152–159`) tells the user to edit `src/db/cards.seed.ts` and run `npm run seed:cards`; `src/lib/sync-messages.ts` messages say "check the server log" with no in-app log surface. Mitigated by the single-technical-user context, but the UI cannot itself resolve the situations it reports (self-descriptiveness gap per ISO 25010).
- **Raw JSON error fallback can reach the UI** (1 auditor) — `itemErrorMessage` in `src/app/page.tsx:16–19` falls back to `JSON.stringify(error)` when no message field is extractable; a rare but real path to surfacing a stringified object to the user.
- **No on-page orientation for first use** (2 auditors, ranked moderate/minor) — the home page renders only `<h1>SpendRight</h1>` plus buttons; the product description exists only in `<head>` metadata (`src/app/layout.tsx:5`) and README. Weak appropriateness-recognizability, low severity given the sole user is the developer.

# Minor Concerns

- **Table semantics lack AT association** (2 auditors) — `<th>` cells in `AccountsTable` (`src/app/page.tsx`) and `TransactionTable.tsx` have no `scope="col"` or `<caption>`, and the per-row patch error isn't wired to its `<select>` via `aria-describedby`.
- **Ambiguous repeated "Remove" buttons** (1 auditor) — each institution's Remove button (`src/app/page.tsx:87`) has no distinguishing accessible name (e.g. "Remove {institutionName}"), making them indistinguishable in a screen reader's buttons list with multiple institutions.
- **Disabled controls give no reason** (1 auditor) — "Sync all" (`src/app/page.tsx:122`) is disabled with no `title`/`aria-label` explaining why.
- **No in-flight indicator for category edits** (1 auditor) — optimistic update covers most feedback need, but there's no "saving…" state while the PATCH is in flight; only a post-hoc failure message.
- **Single-language, no locale/currency formatting** (all 3 auditors) — hardcoded English strings throughout, fixed `<html lang="en">`, and monetary values rendered as raw numbers with an adjacent ISO code column. Flagged for completeness against the Inclusivity subcharacteristic; low priority at current scope.
