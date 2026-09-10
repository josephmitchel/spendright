---
characteristics: [reliability]
level: moderate
status: new
first-seen: 09-08-2026-210043
locations:
  - src/lib/plaid.ts:159
  - src/lib/plaid.ts:172
  - src/lib/plaid.ts:228
  - src/lib/plaid.ts:249
---

# Documented "one bounded retry" Plaid policy is applied to sync calls only

SNAPSHOT.md states a project-wide policy: one bounded retry on transient Plaid failures (no response, ≥500, or 429 honoring Retry-After capped at 30s). The shared `retryOnce()` helper implements this and wraps `getItem`, `getAccounts`, and the `transactionsSync` page loop — exactly the calls used by the sync engine. However, `createLinkToken`, `exchangePublicToken`, `getInstitutionById`, and `removeItem` bypass `retryOnce()` and call the client directly, so a single transient 5xx/timeout/429 on those paths fails outright. The impact is worst for `exchangePublicToken`: by then the user has completed the entire interactive Plaid Link modal (institution search, credentials, MFA), and a transient hiccup discards that whole flow — while the same request retries `accountsGet`/`itemGet`/`transactionsSync` moments later. `createLinkToken` failing blocks both new connections and the "Fix connection" repair path the same way. This is a fault-tolerance/availability gap, not a data-integrity one, but it is a code-verifiable deviation from the documented reliability policy rather than a scoped exception. Suggested direction: route these four calls through `retryOnce()` (or a call-site-appropriate equivalent), or update SNAPSHOT.md's "Backoff policy" line to explicitly scope the retry policy to the sync engine.
