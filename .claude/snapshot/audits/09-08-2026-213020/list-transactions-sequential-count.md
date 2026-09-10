---
characteristics: [performance-efficiency]
level: minor
status: resolved
first-seen: 09-08-2026-210043
locations:
  - src/lib/transactions.ts:22
---

# Sequential round trips for the transaction page's row query and count query

`listTransactions` awaited the paginated row `select` and the separate `count(*)` query back-to-back, doubling round-trip latency on the highest-frequency read path (account-detail load and its 60-second poll).

Verified fixed by all three performance-efficiency auditors: `src/lib/transactions.ts:22-40` now wraps both independent queries in a single `Promise.all`, so they fire concurrently — exactly the suggested fix.
