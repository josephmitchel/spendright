---
name: category-kind-sign-rule
description: Card categories attach to spend rows (amount >= 0) and global rate-less credit categories to inflow rows (amount < 0), enforced by a DB check constraint
tags: [isInflowAmount, src/lib/amounts.ts, transactions_category_kind_sign_ck, credit_categories, card_categories]
date: 2026-09-04
---

Plaid's sign convention: positive is a purchase, negative is an inflow (payment, refund, reward). Card categories go on spend rows and carry a rate; credit categories are one global list shared by every card, carry no rate, and go on inflow rows. The two are mutually exclusive by construction of the `transactions_category_kind_sign_ck` constraint. Every layer classifies amounts through `isInflowAmount` and nothing else.
