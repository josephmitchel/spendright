---
characteristics: [performance-efficiency]
level: minor
status: new
first-seen: 09-08-2026-210043
locations:
  - src/lib/transactions.ts:22
---

# Sequential round trips for the transaction page's row query and count query

`listTransactions` awaits the paginated row `select` and only then awaits the separate `count(*)` query — two independent reads issued back-to-back instead of concurrently. Neither depends on the other's result, so this doubles the Postgres round-trip latency for every account-detail page load and every 60-second poll of that page (`useTransactionPage` hits this on each visible-poll cycle). At current scale the absolute cost is a few milliseconds, but it's a no-downside fix — wrap both queries in `Promise.all` — and it compounds on the highest-frequency read path in the app. Nothing in the snapshot blesses sequential-when-parallelizable queries (as opposed to the deliberately-accepted use of offset pagination and a full count at all, which is not flagged).
