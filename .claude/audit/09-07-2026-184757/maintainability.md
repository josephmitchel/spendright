---
characteristic: "maintainability"
---
# Summary

Four auditors reviewed the codebase against ISO/IEC 25010:2023 §3.7. None found a Major concern, and all four confirmed the quality gates pass cleanly: `tsc --noEmit`, `eslint` (strict TS, `noUncheckedIndexedAccess`, no `any`), `madge --circular` (no cycles across ~80 files), and all three design-consistency scripts (`check-design-refs.mjs` — 88 records, `check-record-tags.mjs` — 524 tags, `check-verified-claims.mjs` — 13 markers). The previously flagged Postgres pool-bootstrap duplication is verified fixed: `db.ts`, `scripts/seed-cards.ts`, and `scripts/rotate-encryption-key.ts` all now consume `src/lib/pool-config.ts`.

The auditors split on how to treat two items that now have design records: `src/lib/plaid.ts`'s size (303 lines, seams recorded in `plaid-module-seams.md` with a 400-line split trigger) and `scripts/start.mjs`'s growth into a process supervisor (recorded in `process-crash-backstop.md`). One auditor treated both as resolved-via-recorded-decision; others still flagged the residual risk. Both are listed below with that context so the user can decide whether the records fully settle them.

Deliberately excluded per project memory and design records: the deferred test suite, the single-card catalog, and untracked audit folders.

# Major Concerns

None.

# Moderate Concerns

- **The design-record corpus is outgrowing the codebase it documents** (flagged by 3/4 auditors) — `.claude/design/current/` holds 88 records against ~80 source files under `src/`, and the gap widened since the last audit (was 81 vs 76). The corpus is the deliberate mechanism keeping agent-driven changes consistent, but the meta-tooling that keeps it honest is custom regex parsing over comment conventions (e.g. `check-record-tags.mjs` scraping `src/db/schema.ts`'s authoring style) with no test coverage of its own. Note: one auditor observed `check-design-refs.mjs:64-83` now resolves `[[name]]` cross-links, closing a gap two other auditors reported as still open. Not a defect today — a trend to watch as the analysability burden compounds.

- **`scripts/start.mjs` has grown into an untested, stateful process supervisor** (Moderate for 1 auditor, Minor for another, resolved-by-record for a third) — now ~105–119 lines (up from ~30), concentrating CLI port re-parsing, `tighten-next.mjs` invocation, a crash-loop guard with a sliding restart window (module-level mutable `recentStarts`/`shuttingDown`/`child`), and deadline-based warm-up polling, with `spawnServer`/`warmUp` mutually re-invoking through `setTimeout`. It has only JSDoc `@ts-check`, sits outside the app's module boundaries, and has no test path — yet it is the piece responsible for keeping automatic sync alive. The design rationale is recorded (`process-crash-backstop.md`), but the timing/interleaving correctness (a restart racing a fresh `warmUp()`, the 60s crash-loop window) is only verifiable by manual trace.

- **`src/lib/plaid.ts` remains a multi-responsibility module** (Moderate for 1 auditor; others treat `plaid-module-seams.md` as settling it) — 303 lines mixing env validation, client construction, retry policy, type adapters, and seven Plaid operations. The seams are documented with a 400-line split trigger, but no lint rule enforces it (see the Minor lint-guardrail finding below).

# Minor Concerns

- **No automated guardrail against file/function growth** (1/4, but underpins two Moderate items) — `eslint.config.mjs` has no `complexity`/`max-lines` rules; `plaid.ts`'s growth was caught only by manual audit. The next file that quietly crosses a threshold between audits won't be caught by `npm run lint`, unlike every other design-consistency rule.

- **Concurrency/ordering invariants enforced only by comments, not types or asserts** (4/4) — `src/app/accounts/[accountId]/category-write-state.ts:24-36` (`recordCommit`/`settleIfDone` silently no-op without a prior `joinBurst`) and `src/hooks/useLoadProtocol.ts:41-42` (prose-only caller contract). One auditor suggests a discriminated union over `{hold:'held', burst}` / `{hold:'releasing'}` / idle if the module is touched again.

- **`AccountView` concentrates cross-hook wiring behind an unenforced sharing contract** (3/4) — `src/app/accounts/[accountId]/page.tsx:98-153` threads one `CategoryWriteState` into both `useTransactionPage` and the category-patch flow; correctness depends entirely on this file's wiring, unverified given deferred tests.

- **Near-identical names across the card domain** (3/4) — `src/lib/cards.ts` (matching), `card-catalog.ts` (loading), `card-types.ts` (types); filename alone doesn't distinguish responsibility — the friction class `modules-named-for-contents.md` addresses elsewhere.

- **Three similarly named error-message helpers across three files** (3/4) — `errorMessage` (`src/lib/http.ts:3`), `publicErrorMessage` (`src/lib/errors.ts:35`), `plaidErrorMessage` (`src/lib/plaid-errors.ts:39`); correctly layered, but changing error presentation requires opening all three.

- **Three near-duplicate "skipped sync" message formatters** (3/4) — `src/lib/sync-messages.ts:5-43` encode the same held-vs-dropped policy in three prose strings (API error, UI notice, server log) with no shared template; changes must be hand-synced.

- **`storeItem`'s three-way conditional-spread merge is dense** (3/4) — `src/lib/link.ts:61-104`; the "a failed metadata fetch never nulls a stored value" invariant is only verifiable by tracing spread precedence across `alwaysUpdated`/`institutionValues`/`institutionUpdate`.

- **`SingletonKey` is a required edit point for every new process-wide singleton** (2/4) — `src/lib/global-singleton.ts:9-17`, currently 8 keys; a deliberate closed-union trade-off, fine today, worth revisiting if the count keeps growing.

- **`scripts/start.mjs` hand-rolls Next's CLI port-parsing** (1/4) — lines ~20-37 reimplement a small grammar; it fails closed today but can silently drift from Next's actual parsing across version bumps, and the `Verified-on:` convention doesn't cover this CLI-syntax dependency.

- **Duplicated rationale prose for `AccountPayload.itemError`** (1/4) — `src/lib/api-types.ts:33-35` and `src/app/api/accounts/[accountId]/route.ts:17` each explain the same design in prose; both cite `account-fetched-by-id`, which mitigates drift, but the explanation is written twice.

- **No CI** (3/4) — no `.github/workflows` or active git hooks; quality gates run only via local `prebuild`, which `npm run dev` bypasses entirely, and nothing external enforces that `build` runs before a change is considered done. Reasonable for a solo local project; noted as the one remaining gap in the safety net.
