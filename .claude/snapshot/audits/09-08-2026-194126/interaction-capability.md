---
characteristic: 'interaction capability'
---

# Summary

All four prior Minor concerns are verified resolved by all three auditors: focus management and a lasting `role="status"` confirmation after institution removal (`src/app/page.tsx:127-134`), consistent `'—'` rendering for missing values (`TransactionTable.tsx:64-76`, `page.tsx:50`), pagination reflected in the URL via `?page=` + `history.replaceState` (`useTransactionPage.ts`), and per-institution `aria-label`s on repeated Remove/Fix-connection buttons. The interaction layer otherwise remains disciplined — always-mounted live regions, native controls, double-submission guards, actionable error copy. This audit surfaced one new Moderate (user-error-protection gap on the app's most destructive action) and one new Minor (accessibility of disabled category selects).

# Major Concerns

None.

# Moderate Concerns

- `[new]` **Destructive removal confirmation doesn't name the institution being removed.** `src/app/useItemRemoval.ts:32` — `confirm('Remove this institution and all of its accounts and transactions?')` is a fixed string even though `institutionName` is available in scope (and used in the failure message). With two or more linked institutions, a misclick on the wrong row's Remove button gives the user no institution-identifying detail in the one dialog meant to catch that mistake before an irreversible cascading delete. One-line fix: `` `Remove ${institutionName} and all of its accounts and transactions?` ``.

# Minor Concerns

- `[new]` **Disabled category selects give no accessible reason for being disabled.** `src/app/accounts/[accountId]/TransactionTable.tsx:37-46` and the sighted-only notice at `page.tsx:174-176` ("Category lists may be out of date — editing is off until they refresh."). The disabled `<select>` carries no `aria-describedby` pointing at the explanation, so a screen-reader user hears only "disabled, combo box" with no why or when. Fix: give the notice an `id` and reference it from each `CategorySelect`.

# Resolved since prior audit

- `[prior → resolved]` No focus management / lasting confirmation after institution removal.
- `[prior → resolved]` Inconsistent "no value" rendering (`rateCellText`, `name`/`merchantName`, `account.mask`).
- `[prior → resolved]` Pagination state not reflected in the URL.
- `[prior → resolved]` Repeated per-institution buttons lacked distinguishing accessible names.
