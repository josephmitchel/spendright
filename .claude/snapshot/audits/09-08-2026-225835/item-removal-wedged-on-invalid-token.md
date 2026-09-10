---
characteristics: [safety]
level: moderate
status: new
first-seen: 09-08-2026-225835
locations:
  - src/lib/items.ts:52
  - src/lib/plaid.ts:254
---

# Item removal can be permanently wedged by a Plaid-rejected (but decryptable) access token

SNAPSHOT states the invariant plainly: "an undecryptable token skips the
revoke (logged) so removal is never wedged." `removeItemCompletely`
(`src/lib/items.ts:52-58`) honors that for undecryptable tokens and for
Plaid's `ITEM_NOT_FOUND`, but any other definitive Plaid rejection — most
realistically `INVALID_ACCESS_TOKEN` (a `PLAID_ENV` change invalidating all
stored tokens, or a bad key restore) — re-throws, so the local
`db.delete(items)` never runs. The institution, its accounts, and its full
transaction history become permanently unremovable through the UI.
`removeItem` (`src/lib/plaid.ts:254-257`) does one retry then propagates the
raw error; nothing upstream reclassifies it.

Severing the third-party grant over the user's bank accounts is the user's
only control point here; a failure mode that blocks that control while
retaining the encrypted token and financial history indefinitely is not a
safe resting state (ISO 25010 fail-safe).

Suggested direction: extend the tolerated-error set alongside
`ITEM_NOT_FOUND` to cover Plaid's "this token can never work again" family
(e.g. `INVALID_ACCESS_TOKEN`) — log and proceed to local delete, same as the
undecryptable-token branch — while continuing to throw for
transient/ambiguous failures (5xx, network, 429).
