---
characteristic: "maintainability"
---
# Summary

Five auditors reviewed modularity, reusability, analysability, modifiability, and testability. The consensus is that this codebase is unusually well-engineered for maintainability at its stage: small single-purpose modules (avg ~55 lines/file, largest 274), zero circular dependencies (madge-verified), strict TypeScript (`strict`, `noUncheckedIndexedAccess`), lint-enforced promise/import discipline, thin API routes delegating to `src/lib`, and — distinctively — a design-record system whose three custom checkers (`check-design-refs.mjs`, `check-record-tags.mjs`, `check-verified-claims.mjs`) mechanically fail the lint run on code/record drift. Auditors who ran the full toolchain (`tsc --noEmit`, `eslint`, the repo checkers) found everything clean: 72 records in sync, 410 tags resolved, 12 verified-on claims current, no dead code or TODO debt. Deferred tests were excluded per the standing decision.

The one finding raised by four of five auditors, independently, at Moderate severity: the stringly-typed `globalSingleton` registry.

# Major Concerns

None found by any of the five auditors.

# Moderate Concerns

- **Stringly-typed, collision-prone `globalSingleton` registry** (flagged by 4 of 5 auditors) — `src/lib/global-singleton.ts:7-11` stores every process-wide singleton in one `Map<string, unknown>` keyed by ad hoc string literals with an unchecked `as T` cast on retrieval. Six call sites across five modules (`'pool'`/`'db'` in `db.ts:22,28`, `'plaidClient'` in `plaid.ts:59`, `'syncItemTails'` in `sync.ts:36`, `'syncAllInFlight'` in `sync-all.ts:13`, `'syncScheduler'` in `sync-scheduler.ts:12`). Nothing enforces key uniqueness at compile time — a colliding or typo'd key silently shares unrelated state, miscast to the wrong type, surfacing only at runtime. The underlying pattern is a documented, legitimate bundler workaround; the fix is a typed key registry (const object of keys/factories), which preserves it while eliminating the collision class.

- **`DELETE /api/items/[itemId]` regresses the project's own thin-routes rule** — `src/app/api/items/[itemId]/route.ts:14-41` inlines the entire removal workflow (token decrypt, Plaid `removeItem` with `ITEM_NOT_FOUND` tolerance, local delete) in the handler. `thin-routes-domain-in-lib.md:18` records this exact anti-pattern being fixed once before for the category-PATCH and link flows; `src/lib/items.ts` holds only projections. Untestable without constructing a `Request`.

- **Quality gates are not enforced by CI or the build** — no `.github` workflows, no active git hooks; the three design-consistency scripts run only via `npm run lint` (`package.json:15`), and `build`/`prebuild`/`postbuild` never invoke them. The entire design-record + minimal-comments strategy depends on these checks running; today nothing forces them to.

- **`check-record-tags.mjs` regex-parses `schema.ts` as a lint dependency** — `scripts/check-record-tags.mjs:40-64` extracts table/column names by regex on `pgTable('name',` shapes and throws on mismatch. An innocuous stylistic change to `schema.ts` (multi-line `pgTable`, a helper wrapper) hard-fails the build with an exception rather than a lint finding — an undocumented structural contract on one file.

# Minor Concerns

- **Concurrency invariants concentrated in hand-rolled state machines, enforced only by prose** (3 of 5) — `src/app/accounts/[accountId]/category-write-state.ts:4-56` (burst/hold machine: `recordCommit`/`settleIfDone` assume a prior `joinBurst`, ordering enforced by nothing in the types; the single call site in `useCategoryPatches.ts:71-104` happens to be right) and `src/hooks/useLoadProtocol.ts:41-116` (caller contract "perform is memoized… stickyKeys read once" stated only in a comment; violation fails silently as stale closures). Authoritative explanations live in design records, not the type system. Analysability/modifiability hotspot — extra care on any touch.
- **Design-record corpus carries its own maintenance surface** (3 of 5) — 72 records (~1,000 lines) vs ~3,900 LOC, cross-linked and regex-checked by bespoke scripts; traceability is one-directional (code→record only — several current records have zero inline references and nothing detects them going stale); the corpus grows linearly with no consolidation mechanism beyond `retired/`. An asset today; watch the ratio.
- **`src/lib/plaid.ts` (274 lines) mixes responsibilities** — env validation, client construction, type adapters, and six Plaid operations; cohesive now, no recorded boundary if it keeps growing.
- **Category-kind concept spans parallel keyed structures** — `category-kinds.ts:11-25`, `category-kind-sources.ts:10-19`, a switch in `categories.ts`, plus `sync-persist.ts` and the DB constraint; exhaustiveness is compiler-enforced but a maintainer must keep several representations in sync.
- **Three similarly named error-message helpers** — `errorMessage` (`http.ts:3`), `publicErrorMessage` (`errors.ts:35`), `plaidErrorMessage` (`plaid-errors.ts:33`); each correctly scoped, but a newcomer must open all three.
- **Inline O(items×accounts) grouping in render** (2 of 5) — `src/app/page.tsx:140` filters the full account list per institution inside `itemList.map`; extract a `groupAccountsByItem` helper.
- **`storeItem`'s dense conditional-spread logic** — `src/lib/link.ts:60-83`; three spreads gated by two different null-check conditions; a named helper would make the "failed fetch never nulls a stored value" rule verifiable at a glance.
- **`scripts/start.mjs:20-30` reimplements Next's CLI port-parsing** — can quietly diverge from Next's actual parsing within a compatible version range; `Verified-on:` markers don't cover CLI syntax.
- **Package manager unpinned** — Node is pinned three ways, but no `packageManager` field or `engine-strict`; the install/build toolchain isn't reproducibly declared.
