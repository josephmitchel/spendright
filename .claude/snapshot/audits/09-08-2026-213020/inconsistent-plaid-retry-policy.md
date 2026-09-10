---
characteristics: [reliability]
level: moderate
status: resolved
first-seen: 09-08-2026-210043
locations:
  - src/lib/plaid.ts:168
  - src/lib/plaid.ts:175
  - src/lib/plaid.ts:233
  - src/lib/plaid.ts:254
---

# Documented "one bounded retry" Plaid policy is applied to sync calls only

`createLinkToken`, `exchangePublicToken`, `getInstitutionById`, and `removeItem` bypassed the shared `retryOnce()` helper, so a single transient Plaid failure on those paths failed outright — worst on `exchangePublicToken`, where it discarded a completed interactive Link flow.

Verified fixed by all three reliability auditors: every Plaid client call in `src/lib/plaid.ts` is now routed through `retryOnce()` (`createLinkToken` line 168, `exchangePublicToken` line 175, `getItem` line 226, `getInstitutionById` line 233, `getAccounts` line 249, `removeItem` line 254, and the `transactionsSync` page loop at line 294). A grep for `getClient().<method>` call sites confirmed none bypass the helper — the one-bounded-retry policy is now uniform.
