---
characteristic: "maintainability"
---
# Summary

No auditor found a major defect, and all three characterized the codebase as a positive outlier: small single-purpose files, thin routes delegating to `src/lib/`, types derived once from the Drizzle schema, strict TS config (`strict`, `noUncheckedIndexedAccess`), high-teeth lint rules (`no-floating-promises`, `no-misused-promises`, `exhaustive-deps` as errors), no `any` casts or `TODO`/`FIXME` markers, and the self-enforcing design-record system (`check-design-refs.mjs`, `check-record-tags.mjs`, `check-verified-claims.mjs`) passing cleanly with zero code/record drift. Missing tests were correctly excluded per the recorded deferral. The findings cluster around the design-governance tooling's enforcement and scaling, the `globalSingleton` registry, and one route that regressed against the codebase's own architecture rule.

# Major Concerns

None found by any auditor.

# Moderate Concerns

- **Quality gates are not enforced automatically** (1 auditor) — no CI workflow and no active git hooks exist, and `npm run build` does not run the three custom design-consistency scripts (they live only under `npm run lint`). The entire "comments-minimal + design-record" strategy depends on those checks firing, and today they only fire when run by hand. (The security report independently flags the same gap for `npm audit`.)
- **`globalSingleton` is a stringly-keyed, unchecked shared-state registry** (2 auditors) — `src/lib/global-singleton.ts` backs five unrelated singletons (`'pool'`, `'db'`, `'plaidClient'`, `'syncItemTails'`, `'syncAllInFlight'`, `'syncScheduler'`) distinguished only by ad hoc string literals with an `as T` cast on retrieval. Nothing enforces key uniqueness at compile time; a future literal collision would silently share state across unrelated modules with a hard-to-diagnose failure mode. A typed const-object of keys would remove the risk while keeping the documented cross-bundle workaround.
- **`DELETE /api/items/[itemId]` regressed against the thin-routes rule** (1 auditor) — `src/app/api/items/[itemId]/route.ts:14–41` inlines the full removal workflow (decrypt, Plaid `removeItem` with `ITEM_NOT_FOUND` tolerance, local delete) in the handler, the exact shape `thin-routes-domain-in-lib.md` records fixing before for the PATCH and link flows. `src/lib/items.ts` exists but holds only projections.
- **`CategoryWriteState`'s call-ordering contract lives only in prose** (1 auditor) — the burst/hold state machine (`category-write-state.ts` + its two driver hooks) must be driven in a specific sequence documented in `optimistic-category-writes.md` (which records two races already fixed there), but the class has no runtime assertions and no tests — the likeliest spot for a previously-fixed race to silently return.
- **Design-record corpus is growing faster than the code** (2 auditors) — 70 records for ~3,600 lines of application code, with `check-record-tags.mjs` requiring every tag to stay live. Routine refactors now touch code plus every record tagging the renamed identifier, and several narrow/overlapping records already supersede each other. Worth periodic consolidation so the record set doesn't outpace what it describes.

# Minor Concerns

- **No topical index over the design records** (2 auditors) — `DESIGN.md` documents process but no table of contents; discovery relies on `Design:` markers and grep. Low cost to add, growing value.
- **Records read as append-only narratives** (1 auditor) — e.g. `optimistic-category-writes.md`, `scheduled-sync.md` interleave the current rule with dated revision history; "what does the code do now" takes parsing layers of prose.
- **The consistency scripts are themselves unverified, load-bearing parsers** (2 auditors) — `check-record-tags.mjs` regex-parses `src/db/schema.ts` and hand-rolls frontmatter parsing; they gate lint and keep the whole strategy honest, verify existence but not prose accuracy, and have no tests (consistent with the deferred-testing stance). Worth occasional manual sanity checks as conventions evolve.
- **Category-kind logic spans five files with parallel keyed structures** (2 auditors, overlapping) — `category-kinds.ts`, `category-kind-sources.ts`, `categories.ts` (`resolveCategoryPick` switch), `sync-persist.ts`, and the schema check constraint. Compiler exhaustiveness (`assertNeverKind`/`satisfies`) catches missed branches, but a maintainer changing the concept visits five places, and two idioms (Record lookup vs. switch) coexist for the same dispatch concept.
- **Three similarly-named error-message helpers** (1 auditor) — `errorMessage` (`http.ts`, client), `publicErrorMessage` (`errors.ts`, server), `plaidErrorMessage` (`plaid-errors.ts`); each legitimately scoped, but a newcomer opens all three to know which applies.
- **`useLoadProtocol.ts` is the steepest shared abstraction** (1 auditor) — dense generics (mapped types, ticket-based staleness) that every page loader depends on; a deliberate dedup trade-off, flagged as the first high-complexity module a new contributor hits.
- **Package manager unpinned** (1 auditor) — Node is pinned three ways (`engines`, `.nvmrc`, `@types/node` per `node-version-pinned.md`) but there's no `packageManager` field or `engine-strict` for npm itself.
- **`src/lib/plaid.ts` (235 lines) mixes config, client construction, and six operations** (1 auditor) — currently cohesive; no recorded boundary for a future split.
- **O(items × accounts) inline filter in `InstitutionSection`** (1 auditor) — `src/app/page.tsx` filters `accountList` inside `itemList.map`; grouping once above the map would be cheaper and clearer.
