---
characteristic: "interaction capability"
---
# Summary

All four auditors reached identical conclusions: the four prior Moderate concerns (per-row removal-state bleed, unlocalized money, ambiguous blank balance cells, retry with no in-flight feedback) remain fixed, and all 12 prior Minor concerns remain open with zero new findings. The recurring theme is accessibility/self-descriptiveness polish — ARIA naming, focus management, table captions, disabled-state explanations — rather than functional breakage: the app is fully keyboard-operable (all native controls) and every async operation has some status/error surface. Design carve-outs (`unstyled-for-now.md`, `operator-is-developer.md`) were checked and respected, and the `async-status-announced.md` live-region pattern is applied correctly everywhere except the one gap flagged below.

Totals: 0 Major, 0 Moderate, 12 Minor (all prior, 0 new).

# Major Concerns

None.

# Moderate Concerns

None.

# Minor Concerns

All flagged by all 4 auditors:

- `[prior]` **`confirm()` text doesn't name the institution being removed.** `src/app/useItemRemoval.ts:29` — generic text even though `institutionName` is in scope (used for the failure message on line 20).

- `[prior]` **No announced success confirmation for institution removal.** `src/app/page.tsx:96` — the `role="status"` "Removing…" text reverts to `null` on success with nothing persisted, contrary to `async-status-announced.md`'s start/success/failure contract (contrast `useSyncAll.ts:34`'s "Sync complete…" pattern).

- `[prior]` **No focus management after destructive removal.** No `.focus()` call anywhere in `src/`; removing an institution unmounts the focused button's `<section>` with nowhere for focus to land.

- `[prior]` **Interactive controls nested inside a heading.** `src/app/page.tsx:83-97` — the logo `<img>` and "Remove" `<button>` sit inside the `<h2>`, so heading navigation announces button text as part of the heading.

- `[prior]` **Labels fall back to raw internal IDs.** `src/app/page.tsx:88` (`item.institutionName ?? item.itemId`) and `src/lib/account-display.ts:8` (`account.name ?? account.officialName ?? account.accountId`) — an opaque Plaid ID is not a recognizable label.

- `[prior]` **Data tables lack `<caption>`/accessible names.** No `caption` or `aria-labelledby` anywhere in `src/`; multiple `AccountsTable` instances per page are distinguishable only by an unassociated visual heading.

- `[prior]` **Error boundaries offer no path back to a known-good route.** `src/app/error.tsx` and `src/app/global-error.tsx` offer only Retry, no link home — unlike `not-found.tsx`, which has one.

- `[prior]` **Disabled controls don't expose their reason.** "Sync all" (`src/app/page.tsx:140`) and the stale-category `<select>`s (`TransactionTable.tsx:155`) have no `aria-describedby` tying them to the adjacent explanatory text (`src/app/accounts/[accountId]/page.tsx:183-185`); zero `aria-describedby` hits repo-wide.

- `[prior]` **No first-run orientation.** `src/app/page.tsx:158` — a single "No institutions connected yet." line plus the Connect button; tracked against `operator-is-developer.md`'s revisit trigger, which hasn't fired.

- `[prior]` **Transaction dates rendered as raw strings.** `TransactionTable.tsx:143` prints `txn.date` verbatim while sibling timestamps use `.toLocaleString()`.

- `[prior]` **Item-error fallback can surface raw JSON.** `src/lib/item-error-message.ts:6` — `JSON.stringify(error)` is the fallback for non-allow-listed error shapes (every field of `PlaidErrorFields` is optional, so the fall-through is reachable).

- `[prior]` **"Remove"/"Fix connection" buttons have non-unique accessible names across institutions.** `src/app/page.tsx:89-94` and `RepairConnectionButton.tsx:35-37` carry no `aria-label` naming the institution; `CategorySelect`'s `ariaLabel` prop (`TransactionTable.tsx:35,43,156`) is the established, still-unapplied fix pattern.
