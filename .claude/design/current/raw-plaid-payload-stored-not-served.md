---
name: raw-plaid-payload-stored-not-served
description: The full Plaid transaction object is stored per row for debugging and excluded from every API response
tags: [transactions.plaid_transaction, GET /api/transactions, PATCH /api/transactions/[transactionId], getTableColumns]
date: 2026-09-04
---

`plaid_transaction` keeps the raw transactions/sync payload. Both transaction routes exclude it by destructuring it out of `getTableColumns`, so any newly added column still reaches the client without a route change while this one never does.
