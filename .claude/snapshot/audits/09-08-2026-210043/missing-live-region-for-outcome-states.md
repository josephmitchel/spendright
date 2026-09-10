---
characteristics: [interaction-capability]
level: moderate
status: new
first-seen: 09-08-2026-210043
locations:
  - src/app/page.tsx:185
  - src/app/page.tsx:188
  - src/app/accounts/[accountId]/page.tsx:161
  - src/app/accounts/[accountId]/page.tsx:164
  - src/app/accounts/[accountId]/page.tsx:181
---

# Terminal/outcome view states render outside any live region

SNAPSHOT.md's accessibility section states a binding project convention: errors render conditionally with `role="alert"`; status text lives inside always-mounted `role="status"` wrappers ("wrapper must stay mounted"), and new async UI must follow this. The convention is followed for `loading` and every transient action (sync, remove, retry, category patch), but several equally-asynchronous outcome states resolve as plain, conditionally-mounted `<p>` elements with no live-region role at all: "No institutions connected yet.", "Accounts couldn't be loaded — use Retry above.", "Account not found…", "Card not supported…", and "No transactions.". None of these coincide with the `error` state from `useLoadProtocol` (the loads succeeded; the outcome is merely empty/unsupported/not-found), so the adjacent `<ErrorNotice>` alert never fires either. A screen-reader user hears the status region go from "Loading…" to silence — the actual outcome message is never announced, and discovering why nothing happened requires an unprompted page re-scan. This is a self-inconsistent regression against the codebase's own convention and a genuine operability gap. Suggested direction: wrap these outcome messages in the same `role="status"` (or `role="alert"` where they represent a degraded state, e.g. the accounts-couldn't-load message) pattern already used elsewhere on both pages.
