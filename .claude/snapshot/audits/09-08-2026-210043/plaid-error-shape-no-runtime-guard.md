---
characteristics: [compatibility]
level: minor
status: new
first-seen: 09-08-2026-210043
locations:
  - src/lib/plaid-errors.ts:20
  - src/lib/errors.ts:21
  - src/lib/sync-outcome.ts:20
---

# Plaid/axios error-shape extraction has no startup verification, unlike the parallel redaction path

`plaidErrorBody` duck-types `err.response.data` off the installed axios's `AxiosError` shape to extract `error_code`/`display_message` — the only place SpendRight interprets the error information Plaid sends back, and it drives real behavior: whether the client sees Plaid's actual message vs. a generic fallback, and whether the "Fix connection" repair button appears at all (`isPlaidItemError` treats anything that fails extraction as an app-internal notice). The codebase already recognizes this exact risk class — a version bump changing axios's error shape — and guards it for the redaction path with `assertAxiosErrorRedaction()` (`src/lib/redaction-check.ts`), a startup canary that fails loudly if the shape drifts. No equivalent canary exists for `plaidErrorBody`, so if axios or the plaid SDK's error wrapping ever changes shape (both pinned, so only on a deliberate bump), the failure is silent: Plaid errors degrade to generic 500s and the repair-mode affordance disappears, with nothing at startup to catch it. Suggested direction: add a small startup canary alongside `assertAxiosErrorRedaction` that constructs a synthetic Plaid-shaped `AxiosError` and asserts `plaidErrorBody` still extracts `error_code`/`display_message` — mirroring the verification pattern the codebase already applies one file over.
