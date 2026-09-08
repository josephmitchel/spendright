---
characteristic: 'interaction capability'
---

# Summary

All three auditors agree the interaction layer remains disciplined: consistent `role="status"`/`role="alert"` live-region conventions with always-mounted wrappers, native controls throughout, per-row `aria-label`s on category selects, no focus-outline suppression, and honest, actionable error copy appropriate to the app's single-developer-operator stage. The prior audit's one Moderate concern — institution-removal errors not collocated with their row — was verified as resolved by all three auditors: `useItemRemoval` now returns a per-key `removeErrors` map and `src/app/page.tsx` renders each item's error inline next to its own Remove button (fixed in commit `fbf2912`). Three prior Minor concerns remain open and unchanged, and one auditor surfaced one new Minor concern (undifferentiated accessible names on repeated per-institution buttons).

# Major Concerns

None.

# Moderate Concerns

None. (The prior Moderate — removal errors not collocated with their row — is resolved and verified by all three auditors.)

# Minor Concerns

- `[prior]` **No focus management or lasting confirmation after a successful institution removal** (`src/app/page.tsx`, `InstitutionSection`). On success the entire section — Remove button and its `role="status"` span included — unmounts; nothing moves focus and no permanently-mounted live region announces the removal. Every other mutating action (sync, connect, repair, category patch) reports its outcome through a persistent status/alert node; removal success is communicated only by silent disappearance. (`grep` confirms no `.focus(`/`autoFocus` anywhere in `src/`.)

- `[prior]` **Inconsistent "no value" rendering** (`src/app/accounts/[accountId]/TransactionTable.tsx:64-76`, `:138-139`). `rateCellText` returns bare `null` for an uncategorized card row (empty cell) while a credit row gets `'—'`, and nullable `merchantName`/`name` render raw with no fallback — contradicting the app's own convention in `src/lib/money.ts` ("`'—'` for null so missing never reads as zero"). One auditor observed the same blank-for-null pattern on the home page's `AccountsTable` (`src/app/page.tsx:50`, nullable `account.mask`), so the inconsistency isn't confined to the transaction table.

- `[prior]` **Transaction-list pagination state isn't reflected in the URL** (`src/app/accounts/[accountId]/useTransactionPage.ts:14`). `page` lives in plain `useState(0)`; refresh or back-navigation resets to page 0 and a specific page can't be bookmarked or recovered.

- `[new]` **Repeated per-institution action buttons lack distinguishing accessible names** (`src/app/page.tsx` ~90-104, `RepairConnectionButton.tsx`). Each institution renders plain `<button>Remove</button>` / `<button>Fix connection</button>` with no `aria-label` naming the institution, so with two or more linked banks a screen-reader user scanning by control type hears indistinguishable entries. This breaks the app's own convention — `CategorySelect` adds exactly this kind of per-row `aria-label`. One-line-per-button fix.
