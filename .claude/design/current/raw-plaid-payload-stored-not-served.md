---
name: raw-plaid-payload-stored-not-served
description: The full Plaid transaction object is stored per row for debugging and excluded from every API response
tags:
  [
    transactions.plaid_transaction,
    RawProviderPayload,
    GET /api/transactions,
    PATCH /api/transactions/[transactionId],
    getTableColumns,
  ]
date: 2026-09-04
---

`plaid_transaction` keeps the raw transactions/sync payload. Both transaction routes exclude it through `servedTransactionColumns` in `src/lib/transactions.ts` (moved from src/lib/categories.ts 2026-09-06, quality audit: it is the list-projection's home, not the category writer's) — destructured out of `getTableColumns`, so any newly added column still reaches the client without a route change while this one never does. `CategorizedTransaction` is derived from that pick (`Pick` over its `keyof`), never a separate `Omit` that could drift from it (2026-09-06, [[typed-api-contract]]). Since 2026-09-07 the column's schema type is the opaque `RawProviderPayload` alias ([[plaid-types-adapted-at-ingest]]); the stored value is still the unmodified SDK object, captured in the adapter's `raw` field.
