---
characteristics: [compatibility]
level: minor
status: resolved
first-seen: 09-08-2026-210043
locations:
  - src/lib/plaid-error-check.ts:14
  - src/instrumentation.ts:14
---

# Plaid/axios error-shape extraction has no startup verification, unlike the parallel redaction path

`plaidErrorBody` duck-typed axios's error shape to extract Plaid's `error_code`/`display_message` with no startup canary, so an axios/plaid version bump could silently degrade Plaid errors to generic 500s and remove the repair-mode affordance.

Verified fixed by all three compatibility auditors: new file `src/lib/plaid-error-check.ts` exports `assertPlaidErrorExtraction()`, which round-trips a synthetic Plaid-shaped `AxiosError` through `plaidErrorBody` and throws if the canary `error_code`/`display_message` values aren't extracted. It is wired into startup at `src/instrumentation.ts:14-15`, immediately after `assertAxiosErrorRedaction()` — exactly the mirrored-canary pattern the finding suggested.
