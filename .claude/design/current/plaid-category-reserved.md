---
name: plaid-category-reserved
description: Plaid's personal_finance_category is stored and served but deliberately not rendered; reserved for future auto-categorization
tags:
  [transactions.category, personal_finance_category, src/lib/sync-persist.ts, GET /api/transactions]
date: 2026-09-04
---

The sync writes `personal_finance_category.primary` (falling back to legacy `category[0]`) into `transactions.category`, and `/api/transactions` returns it, but no UI surface shows it. It is kept for a future auto-categorization feature — decided 2026-09-04: that feature is planned but not being built now. The column and its presence in responses are deliberate, not dead weight.
