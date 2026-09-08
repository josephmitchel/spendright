---
name: checked-indexed-access
description: noUncheckedIndexedAccess is on; single-row destructures guard or default the possibly-missing element
tags: [tsconfig.json, noUncheckedIndexedAccess, returning, db.select]
date: 2026-09-06
code-refs: none
---

`noUncheckedIndexedAccess` is enabled (confirmed 2026-09-06): drizzle's idiomatic single-row read `const [row] = await db.select()...` types as non-optional without it, so an empty result was a silent `undefined` flowing into responses. Each such site now guards (`if (!row) throw ...`) or defaults the destructure; a guard that mirrors an invariant the compiler cannot see (a locked row, an upsert's `.returning()`) says so in a comment rather than being deleted as unreachable.
