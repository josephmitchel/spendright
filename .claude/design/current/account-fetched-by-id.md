---
name: account-fetched-by-id
description: A single account is its own resource at GET /api/accounts/[accountId], returning { account } — null on a 200 when the id matches no row; /api/accounts serves the full list only
tags:
  [
    GET /api/accounts/[accountId],
    AccountPayload,
    apiPaths.account,
    useAccountData,
    src/app/api/accounts/[accountId]/route.ts,
    src/app/api/accounts/route.ts,
  ]
date: 2026-09-06
---

Single-account reads used to go through `?accountId=` on the list endpoint, with the client unwrapping `accounts[0]` — the odd one out next to `/api/items/[itemId]` and `/api/transactions/[transactionId]`, and it forced one payload type to serve both "list all" and "fetch one". Now `GET /api/accounts/[accountId]` returns `{ account }` (`AccountPayload`), and `/api/accounts` is the unfiltered list only.

Not-found is `{ account: null }` on a **200**, deliberately not a 404: [[partial-load-rendering]]'s not-found state needs positive evidence that this pass's read succeeded and found nothing, and the single response reader throws on error statuses — a 404 would be indistinguishable from a failed read, replacing the account page's friendly not-found rendering with an error line and Retry.

Raised by the 2026-09-06 quality audit (two auditors) and confirmed by the user.
