---
characteristic: 'functional suitability'
---

# Summary

All three auditors traced the sync engine, category/card matching, carry logic, API contract, pagination, money formatting, and link/repair/remove flows line-by-line against SNAPSHOT.md's claims and found the code tracks the spec with very high fidelity. Both prior Moderate concerns were verified as resolved (commit `fbf2912`): the "Last automatic sync" label now correctly distinguishes manual from scheduled runs via a `SyncTrigger` threaded through `recordLastSync`, and `useSyncAll`'s "fully clean" gate now accounts for `accountRefreshFailed` (with the status line appending the account-refresh notice). One prior Minor remains open, and two of the three auditors independently found one new Minor that is the same defect class recurring on a second page.

# Major Concerns

None.

# Moderate Concerns

None. (Both prior Moderates — the manual-vs-automatic sync label and the account-refresh gap in `useSyncAll`'s success gate — are resolved and verified by all three auditors.)

# Minor Concerns

- `[prior]` **Home page can transiently lose "No institutions connected yet." on a poll hiccup** (`src/app/useHomeData.ts:32`, `src/hooks/useLoadProtocol.ts:69-76`, `src/app/page.tsx:21-27`). `stickyKeys` includes only `'accounts'`, not `'items'`; a single failed background `/api/items` poll flips `loaded.items` to `false` while `itemList` stays `[]`, so `deriveView` falls through to `unresolved` and the message silently disappears until the next successful poll. Self-healing within ≤60s, but misrepresents known state for a poll cycle. Unchanged since the prior audit.

- `[new]` **The same non-sticky-loaded-flag pattern recurs on the account detail page** (`src/app/accounts/[accountId]/useAccountData.ts:20-46` — no `stickyKeys` at all — and `deriveView` in `src/app/accounts/[accountId]/page.tsx:27-40`). Found independently by two of the three auditors. A transient poll failure on `/api/accounts/[accountId]` drops an established "Account not found…" view to a generic error/`unresolved` state, and a transient `/api/cards` failure likewise drops the "Card not supported…" remediation text even though the underlying state hasn't changed. Identical defect class to the prior finding — worth fixing together since both are `stickyKeys` gaps.
