---
characteristic: 'maintainability'
---

# Summary

Four independent auditors reviewed the codebase against ISO/IEC 25010:2023 §3.7 (modularity, reusability, analysability, modifiability, testability). The shared verdict: a well-engineered small codebase (~3,800 LOC across ~40 files, largest file 276 lines) — small cohesive modules, strict TypeScript (`strict` + `noUncheckedIndexedAccess`), lint-enforced promise/import discipline, thin API routes delegating to `src/lib` almost everywhere, and a bespoke self-checking design-record system that gives it notably strong analysability for its size. One auditor confirmed no circular dependencies, dead exports, leftover retired-design code, or stale TODO markers exist. **No major findings.** Deferred tests were not flagged, per standing project decision. Three auditors independently converged on the same four moderate findings.

# Major Concerns

None.

# Moderate Concerns

- **Stringly-typed, collision-prone singleton registry** (`src/lib/global-singleton.ts:3-11`) — flagged by all 4 auditors. One `Map<string, unknown>` keyed by ad hoc string literals (`'pool'`/`'db'` in `db.ts:22,28`, `'plaidClient'` in `plaid.ts:59`, `'syncItemTails'` in `sync.ts:36`, `'syncAllInFlight'` in `sync-all.ts:13`, `'syncScheduler'` in `sync-scheduler.ts:12`) with an unchecked `as T` cast on read. Nothing at compile time prevents a typo'd or colliding key from silently sharing state miscast to the wrong type. A typed key→factory registry would preserve the cross-bundler-copy workaround while removing the collision class.
- **`DELETE /api/items/[itemId]` regresses the project's own thin-routes convention** (`src/app/api/items/[itemId]/route.ts:14-41`) — flagged by 3 auditors. The full removal workflow (token decrypt with fallback, Plaid `removeItem` with `ITEM_NOT_FOUND` tolerance, local delete) is inlined in the handler rather than delegated to `src/lib` (`items.ts` holds only read projections). This is the exact anti-pattern `thin-routes-domain-in-lib.md` documents having fixed once already for the category-PATCH and link flows, and the logic is untestable without constructing a `Request`.
- **Quality gates are not enforced by CI or the build** — flagged by 3 auditors. No `.github/` directory, no active git hooks (samples only); the three design-consistency checkers (`check-design-refs.mjs`, `check-record-tags.mjs`, `check-verified-claims.mjs`), lint, and typecheck run only via manual `npm run lint`/`typecheck` — `build`/`prebuild`/`postbuild` never invoke them. The entire design-record-plus-minimal-comments strategy depends on these checks actually running; the safety net is currently opt-in.
- **`check-record-tags.mjs` regex-parses `schema.ts` as an undocumented structural contract** (`scripts/check-record-tags.mjs:40-75`, `schemaTables()`) — flagged by 3 auditors. Table/column names are extracted via regex over `pgTable('name', ...)` call shapes and imported builder names, throwing an uncaught exception (not a lint finding) on any shape it can't parse. A purely stylistic `schema.ts` refactor (multi-line `pgTable`, a wrapper helper, a reordered `drizzle-orm/pg-core` import) hard-fails the toolchain confusingly, and the coupling is documented nowhere near `schema.ts`.
- **Duplicated Plaid Link deferred-open idiom** (`src/app/PlaidLinkButton.tsx`, `src/app/RepairConnectionButton.tsx`) — one auditor: both components duplicate an identical "defer `usePlaidLink` open until ready" ref + `useEffect` pattern verbatim instead of sharing a hook.

# Minor Concerns

- **Concurrency invariants enforced only by prose, not types** — `category-write-state.ts:4-56` (`recordCommit`/`settleIfDone` assume a prior `joinBurst`; ordering enforced only by the single call site in `useCategoryPatches.ts` being written correctly) and `useLoadProtocol.ts:41-116` (caller contract — "`perform` is memoized, `stickyKeys` read once" — stated only in a comment; violations fail silently as stale closures).
- **Design-record corpus has one-directional traceability** — ~72-78 records cross-linked and regex-checked, but only code→record; nothing detects a record gone stale because no code references it anymore, and there's no consolidation trigger beyond manual retirement. Proportionate today; worth watching as the ratio to ~3,800 LOC grows.
- **`src/lib/plaid.ts` (276 lines, largest file) mixes responsibilities** — env validation, client construction, provider-type adapters, and six distinct Plaid operations; cohesive today, no recorded boundary for splitting it.
- **Category-kind concept spread across ~5 parallel structures** — `category-kinds.ts`, `category-kind-sources.ts`, a switch in `categories.ts`, logic in `sync-persist.ts`, and a DB check constraint; exhaustiveness is compiler-enforced but a maintainer must keep all representations in sync by hand.
- **Three similarly-named error-message helpers** — `errorMessage` (`http.ts:3`), `publicErrorMessage` (`errors.ts:35`), `plaidErrorMessage` (`plaid-errors.ts:39`); each correctly layer-scoped, but a newcomer must open all three to know which applies where.
- **Three near-duplicate sync-message formatters** (`src/lib/sync-messages.ts`) — `skippedItemErrorMessage`, `skippedSyncNotice`, `skippedSyncLogLine` cover the same skipped/dropped concept, risking wording drift across surfaces.
- **Inline O(items × accounts) grouping in JSX** (`src/app/page.tsx:151`) — account filtering inside `itemList.map`; a named `groupAccountsByItem` helper would be independently testable.
- **`storeItem`'s conditional-spread merge is dense** (`src/lib/link.ts:60-90`) — the "failed metadata fetch never nulls a stored value" invariant is only verifiable by tracing three separately-gated spreads.
- **`scripts/start.mjs:20-30` reimplements Next's CLI port-parsing** — fails closed (parsed port is always re-passed), but the grammar can silently diverge across version bumps and the `Verified-on:` convention doesn't cover CLI syntax.
- **No `packageManager` field or `engine-strict`** — Node is pinned multiple ways but the install toolchain itself isn't reproducibly declared.
