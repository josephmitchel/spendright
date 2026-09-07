---
name: category-kind-sign-rule
description: Card categories attach to spend rows (amount >= 0) and global rate-less credit categories to inflow rows (amount < 0), enforced by a DB check constraint
tags:
  [
    isInflowAmount,
    kindForAmount,
    categoryKindKeys,
    categoryKindSources,
    src/lib/category-kinds.ts,
    src/lib/category-kind-sources.ts,
    transactions_category_kind_sign_ck,
    credit_categories,
    card_categories,
  ]
date: 2026-09-04
---

Plaid's sign convention: positive is a purchase, negative is an inflow (payment, refund, reward). Card categories go on spend rows and carry a rate; credit categories are one global list shared by every card, carry no rate, and go on inflow rows. The two are mutually exclusive by construction of the `transactions_category_kind_sign_ck` constraint. Every layer classifies amounts through `isInflowAmount`/`kindForAmount` and nothing else, and everything else kind-specific lives in two kind-keyed descriptors (consolidated 2026-09-06, user-confirmed after a quality audit counted ~8 per-kind branch sites): `categoryKindKeys` in `src/lib/category-kinds.ts` — the row/wire keys (id field a PATCH writes plus the joined name field), client-bundleable, consumed by the PATCH parser, the optimistic patch, and the table's row reads — and its server-graph counterpart `categoryKindSources` in `src/lib/category-kind-sources.ts` — each kind's table paired with its id column (so a query can never get a column from the wrong table) and the retired-pick rejection wording. They are two modules only because of the client/server boundary (renamed 2026-09-06 from `amounts.ts`/`category-kinds.ts` so each is named for what it holds — [[modules-named-for-contents]]). Branches that encode genuinely different per-kind semantics (the card-ownership check, the rate snapshot, the carry columns) remain branches.
