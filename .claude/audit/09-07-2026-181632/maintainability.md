---
characteristic: "maintainability"
---
# Summary

Four auditors assessed maintainability (ISO/IEC 25010:2023 §3.7). Their independent verification converged strongly on the same baseline: `typecheck`, `eslint` (strict TS, `noUncheckedIndexedAccess`, `no-floating-promises`, no `any`, no TODO/FIXME), and all three design-consistency checkers (`check-design-refs`, `check-record-tags`, `check-verified-claims` — 81 records, 481 tags, 13 markers) pass cleanly; there are no circular dependencies (verified with `madge`); routes stay thin with domain logic in `src/lib`; retired designs have not crept back; and prior audit fixes (the `sync.ts` decomposition, `SingletonKey` closed union, `usePlaidLinkOpen` extraction, `prebuild` gating) are live. The deferred-tests decision and single-card catalog were honored and not re-litigated. Findings are structural-hygiene items, none blocking.

# Major Concerns

None.

# Moderate Concerns

- **Postgres pool bootstrap is duplicated verbatim across three files, synced only by a comment** (1 auditor) — `src/lib/db.ts:23-34` (`POOL_TIMEOUTS` + `pool.on('error')`), `scripts/seed-cards.ts:210-216`, `scripts/rotate-encryption-key.ts:20-26`. `db.ts` is `server-only` + `globalSingleton`, so the scripts can't import it and hand-copy the same three timeout literals and error-handler line, held together by a "Timeouts mirror src/lib/db's POOL_TIMEOUTS" comment. No tooling catches drift, though `requests-have-deadlines.md` treats these values as a deliberate invariant. The repo already has the precedent and pattern for the fix: extract a dependency-free `src/lib/pool-config.ts` (as was done for `pg-errors.ts`/`plaid-errors.ts`).

- **`src/lib/plaid.ts` keeps growing as a multi-responsibility module** (1 auditor) — 302 lines (largest file in the repo, up from 276 at the last audit), mixing env/config validation, client construction, retry logic, type adapters, and seven Plaid operations. No lint rule caps file size or complexity, and no design record documents where the seams should go when it does need to split.

- **The design-record corpus is growing faster than the codebase and is itself a maintenance liability** (1 auditor, trend-watch) — 81 records in `.claude/design/current/` vs 76 source files; `[[name]]` cross-links have no resolution check, and `check-record-tags.mjs` regex-parses `schema.ts`'s authoring style. Not a present defect — the record is what keeps agents aligned — but the analysability cost of the prose corpus and the fragility of the meta-tooling will likely grow faster than the app's own logic.

# Minor Concerns

- **Concurrency/ordering invariants enforced only by comments** (1 auditor) — `category-write-state.ts:24-36` (`recordCommit`/`settleIfDone` silently no-op without a prior `joinBurst`) and `useLoadProtocol.ts:41-42` (prose-only caller contract). Violations fail silently rather than at compile time or via assertion.

- **`AccountView` concentrates cross-hook wiring with an un-enforced sharing contract** (1 auditor) — `src/app/accounts/[accountId]/page.tsx:98-144` threads one `CategoryWriteState` instance between two hooks; correctness of the page depends on this one file's wiring, enforced only by parameter types (and unverified given deferred tests).

- **Near-identical names across the card domain** (1 auditor) — `cards.ts` (matching), `card-catalog.ts` (listing), `card-types.ts` (enum), compounded by similarly named design records; filename alone can't distinguish them, the same friction `modules-named-for-contents.md` fixed elsewhere. Cheap to live with (<20 lines each).

- **Three similarly-named error-message helpers** (1 auditor) — `errorMessage` (`http.ts`), `publicErrorMessage` (`errors.ts`), `plaidErrorMessage` (`plaid-errors.ts`); each correctly layered but a newcomer must open all three.

- **Three near-duplicate "skipped sync" message formatters** (1 auditor) — `sync-messages.ts:5-43`; a policy change must be hand-synced across three prose surfaces.

- **Duplicated rationale comments** (1 auditor) — `api-types.ts:33-35` and `api/accounts/[accountId]/route.ts:17` both explain why `AccountPayload` carries `itemError`, with no shared design-record citation.

- **`storeItem`'s three-way conditional-spread merge is dense** (1 auditor) — `link.ts:61-104`; the never-null-a-stored-value invariant is only verifiable by tracing spread precedence.

- **`scripts/start.mjs` reimplements Next's CLI port-parsing** (1 auditor) — lines 22-30; fails closed, but the hand-rolled grammar can drift from Next's parsing across bumps, and the `Verified-on:` convention doesn't cover CLI syntax.

- **`SingletonKey` is a required edit point for every new singleton** (1 auditor) — `global-singleton.ts:9-16`; a deliberate, likely-acceptable coupling, named because it will grow.

- **No CI; quality gates run only via local `npm run build`/`lint`** (1 auditor) — no `.github/workflows`, no active hooks. `prebuild` gating is a real improvement, but `npm run dev` bypasses everything and nothing external enforces that `build` runs. Reasonable for a solo local project today; the one remaining gap in the safety net modifiability relies on.
