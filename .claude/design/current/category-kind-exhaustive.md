---
name: category-kind-exhaustive
description: Every per-kind branch is compiler-exhaustive — a switch whose default funnels to assertNeverKind, or a lookup satisfies-checked against Record<CategoryKind, …> — so adding a category kind fails to compile at every behavior site
tags:
  [
    assertNeverKind,
    categoryKindKeys,
    writeColumns,
    CategoryKind,
    src/lib/category-kinds.ts,
    src/lib/categories.ts,
    src/lib/sync.ts,
    TransactionTable.tsx,
    conflictSetForKind,
  ]
date: 2026-09-06
---

Decided 2026-09-06 after a quality audit found per-kind behavior hand-branched as `if (kind === 'credit')` on a two-member union across ~7 sites — a third kind would silently fall into every `else`.

The rule: a site that behaves differently per kind must be either (a) an exhaustive `switch (kind)` whose `default` returns `assertNeverKind(kind)` (src/lib/category-kinds.ts), or (b) a lookup into an object checked with `satisfies Record<CategoryKind, …>`. Either way, adding a member to `CategoryKind` is a compile error at each site rather than a silent fall-through. `categoryKindKeys` additionally carries each kind's `writeColumns` (the row columns that kind's selection owns, the card kind's rate snapshot included), so kind-generic code — clearing the other kinds' columns in sync's conflict SET — iterates the mapping instead of hand-listing columns.

The one site the compiler cannot reach is the DB sign check constraint (`transactions_category_kind_sign_ck` in src/db/schema.ts); a new kind must extend it by hand, via migration.
