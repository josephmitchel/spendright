---
characteristic: 'reliability'
---

# Summary

The prior audit was a clean pass with zero findings, and two of three auditors confirmed that state holds: advisory-lock timeouts and fail-classification, single-flight sync-all, chunked bulk writes, bounded Plaid retry with `Retry-After` handling, the `MAX_SYNC_PAGES` drain guard, process supervision with crash-loop guarding, key-rotation fallback, and the client load/poll protocols are all intact (with `tsc --noEmit` clean). The third auditor's deeper pass into the Plaid Link client flow found one new Moderate and one related new Minor: the connect/repair path can fail silently if Plaid's CDN script never loads, which is inconsistent with the codebase's otherwise strict never-fail-silently discipline.

# Major Concerns

None.

# Moderate Concerns

- `[new]` **Plaid Link SDK failure leaves the connect/repair flow silently stuck with no error surfaced.** `src/hooks/usePlaidLinkOpen.ts:8-26`, consumed by `PlaidLinkButton.tsx:53-65` and `RepairConnectionButton.tsx:25-35`. If the Plaid Link script/iframe from `cdn.plaid.com` fails to load (network hiccup, DNS failure, ad-blocker), `ready` never becomes true, `open()` is never called, and there is no timeout, retry, or error path. `useAsyncAction`'s `pending` state only covers the link-token fetch, so the "Opening Plaid Link…" message disappears the moment the token resolves — the user is left with an idle-looking button, no `role="alert"`, and no indication anything failed. Affects both the primary connect flow and the repair flow identically.

# Minor Concerns

- `[new]` **The "Opening Plaid Link…" status window doesn't reflect actual state.** `src/hooks/usePlaidLinkOpen.ts:22-25`, `PlaidLinkButton.tsx:76`, `RepairConnectionButton.tsx:47`. The status text is tied to the token fetch's pending state, not to whether Link has actually opened; on a slow connection to Plaid's CDN there is a multi-second window with no status text at all between token resolution and the Link iframe appearing, which reads as the click having done nothing.

# Resolved since prior audit

Nothing to carry — the prior audit recorded zero findings, and no regressions against it were found.
