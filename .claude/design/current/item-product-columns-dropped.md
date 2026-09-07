---
name: item-product-columns-dropped
description: items.available_products and items.billed_products were dropped (migration 0007) as stored-but-never-read; institution metadata and transactions.category stay by their own records
tags:
  [items, dropped available_products, dropped billed_products, drizzle/0007_remarkable_thor.sql, src/lib/link.ts]
date: 2026-09-06
---

Decided by the user 2026-09-06 (raised by a quality audit as dead stored surface): the two Plaid product-list columns were written on every link and read by nothing; Plaid still returns the data if it is ever wanted back. Dropped in `drizzle/0007_remarkable_thor.sql`, writer removed from `src/lib/link.ts`.

Deliberately kept, not dead: the institution metadata columns ([[relink-preserves-institution-metadata]]) and `transactions.category` ([[plaid-category-reserved]]). Do not re-flag those in audits.
