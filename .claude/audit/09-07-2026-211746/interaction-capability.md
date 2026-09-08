---
characteristic: "interaction capability"
---
# Summary

The biggest single improvement of this cycle: all four prior Moderate concerns were fixed in commit `da6bbb8` and verified in code by all four auditors — per-key removal state (`useAsyncAction` now tracks `pendingKeys`, `page.tsx` passes `removingItems.has(item.itemId)` per row, and removal failures name the institution), `Intl`-based money formatting with a Currency column (`src/lib/money.ts`, `money-formatted-with-intl.md`), `'—'` for null balances, and retry in-flight feedback (`useLoadProtocol.reloading` → `ErrorNotice.retryPending` with a `role="status"` "Retrying…" announcement).

The Minor backlog, however, has not moved at all across three consecutive audits: all 12 prior Minors remain open, clustering around accessibility polish (focus management, ARIA naming, table captions) — including two near-misses where the fix commit threaded `institutionName` right past the generic `confirm()` text and the raw date cell without touching them. No new concerns were found; the `unstyled-for-now` and `operator-is-developer` carve-outs were respected.

Totals: 0 Major, 0 Moderate (4 prior resolved this cycle), 12 Minor (all prior, 0 new).

# Major Concerns

None.

# Moderate Concerns

None open. `[prior — resolved]` ×4: page-wide removal state/mislabeled buttons and unattributed failure message; unlocalized money and missing currency column; ambiguous blank balance cells; retry with no in-flight feedback — all fixed in `da6bbb8` as described above.

# Minor Concerns

- `[prior]` **`confirm()` text doesn't name the institution being removed.** `src/app/useItemRemoval.ts:29` — `institutionName` is now a parameter of the function (used for the error message) but the confirm string is still generic.
- `[prior]` **No announced success confirmation for institution removal.** The "Removing…" `role="status"` text reverts to `null` on success with no persisted "Removed" confirmation, unlike `useSyncAll`'s "Sync complete…" pattern — and contrary to `async-status-announced.md`'s commitment that start *and success* are announced.
- `[prior]` **No focus management after destructive removal.** No `.focus()` call anywhere in `src/`; removing an institution unmounts the focused button's `<section>` with nowhere for focus to go.
- `[prior]` **Interactive controls nested inside a heading.** `src/app/page.tsx:83-97` — the logo `<img>` and "Remove" `<button>` sit inside the `<h2>`.
- `[prior]` **Labels fall back to raw internal IDs.** `item.institutionName ?? item.itemId` (`page.tsx:88`) and `account.name ?? account.officialName ?? account.accountId` (`src/lib/account-display.ts:8`).
- `[prior]` **Data tables lack `<caption>`/accessible names.** No `caption` or `aria-labelledby` anywhere in `src/`; multiple `AccountsTable` instances are distinguishable only by an unassociated visual heading.
- `[prior]` **Error boundaries offer no path back to a known-good route.** `src/app/error.tsx` and `global-error.tsx` offer only Retry, no link home (contrast `not-found.tsx`).
- `[prior]` **Disabled controls don't expose their reason.** "Sync all" (`page.tsx:140`) and the stale-category `<select>`s (`TransactionTable.tsx`) have no `aria-describedby` tying them to the explanatory text.
- `[prior]` **No first-run orientation.** `page.tsx:158` — a single "No institutions connected yet." line plus the Connect button; tracked against `operator-is-developer.md`'s revisit trigger, not yet revisited.
- `[prior]` **Transaction dates rendered as raw strings.** `TransactionTable.tsx:143` prints `txn.date` verbatim while sibling timestamps use `toLocaleString()`.
- `[prior]` **Item-error fallback can surface raw JSON.** `src/lib/item-error-message.ts:6` falls back to `JSON.stringify(error)` for non-allow-listed error shapes.
- `[prior]` **"Remove"/"Fix connection" buttons have non-unique accessible names across institutions.** `page.tsx:89-94` and `RepairConnectionButton.tsx:35-37` carry no `aria-label` naming the institution; `CategorySelect`'s `ariaLabel` remains the established, unapplied fix pattern.
