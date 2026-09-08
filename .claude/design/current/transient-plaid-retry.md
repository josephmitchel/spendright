---
name: transient-plaid-retry
description: Plaid calls in the sync path retry once after 1s on a transport-level failure (no response, or a 5xx) — a 4xx is Plaid's real answer and is never retried — so a one-off blip doesn't fail a whole item's sync attempt
tags:
  [
    retryOnce,
    isTransientPlaidFailure,
    TRANSIENT_RETRY_DELAY_MS,
    src/lib/plaid.ts,
    getAccounts,
    transactionsSync,
  ]
date: 2026-09-07
---

Confirmed 2026-09-07: the 2026-09-07 reliability audit found no permanent-vs-transient distinction anywhere in the sync path — a single dropped connection or Plaid 5xx failed the item's whole attempt exactly like `ITEM_LOGIN_REQUIRED`, and a manual Sync all surfaced a hard failure for a momentary blip. `retryOnce` (src/lib/plaid.ts) wraps `accountsGet` and each `transactionsSync` page request: one retry after `TRANSIENT_RETRY_DELAY_MS` (1s) when the error is an axios error with no response (network), a >=500 status, or — added 2026-09-07 after two audit rounds flagged the misread — a 429: a rate limit is Plaid's own throttling signal asking to be retried, not a broken connection, and treating it as permanent surfaced the repair UI for a transient condition. A 429 retry honors `Retry-After` when present (capped at 30s via `MAX_RETRY_AFTER_MS`), else the 1s default. Any other 4xx is a real Plaid answer and propagates immediately, keeping the error-surface semantics of [[error-message-allow-list]] and the not-ready budget of [[not-ready-poll-budgets]] untouched. The hourly scheduler cadence is unchanged — this is one in-attempt retry, not a backoff policy; a full exponential-backoff scheme was considered and deferred as unwarranted at single-user sync volumes.
