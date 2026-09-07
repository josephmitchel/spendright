---
name: plaid-category-reserved
description: Plaid's personal_finance_category is stored and served but deliberately not rendered; reserved for future auto-categorization
tags: [transactions.category, personal_finance_category, src/lib/plaid.ts, GET /api/transactions]
date: 2026-09-04
---

The ingest adapter in `src/lib/plaid.ts` derives `ProviderTransaction.category` from `personal_finance_category.primary` (falling back to legacy `category[0]`), the sync writes it into `transactions.category` ([[plaid-types-adapted-at-ingest]]), and `/api/transactions` returns it, but no UI surface shows it. It is kept for a future auto-categorization feature — decided 2026-09-04: that feature is planned but not being built now. The column and its presence in responses are deliberate, not dead weight.
