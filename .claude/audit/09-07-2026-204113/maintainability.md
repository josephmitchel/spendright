---
characteristic: "maintainability"
---
# Summary

All four auditors re-ran the quality gates fresh and all pass (`tsc --noEmit`, `eslint` + the three design-consistency scripts — 88 records / 524 tags / 13 verified-claim markers, `madge --circular` clean across 80 files). The prior audit's 3 Moderate and 11 Minor concerns all remain open against an unchanged source tree. One auditor's deeper pass surfaced three new findings: a Moderate design inconsistency in `useAsyncAction` (the root cause of the known interaction-capability removal-state defect), and two Minors (a `sync-failure.ts`/`sync-outcome.ts` naming mismatch, and a `format:check` gate that nothing runs — with 40 files already drifted).

# Major Concerns

None.

# Moderate Concerns

- `[prior]` **Design-record corpus outgrowing the codebase.** `.claude/design/current/` holds 88 records against 80 source files under `src/`, kept honest by custom regex/text meta-tooling (`check-record-tags.mjs`, `check-design-refs.mjs`) that has no test coverage of its own. Not a defect today; a compounding analysability trend. (Flagged by all 4 auditors.)
- `[prior]` **`scripts/start.mjs` is an untested, stateful process supervisor.** 118 lines with module-level mutable `recentStarts`/`shuttingDown`/`child`, a sliding-window crash-loop guard, and `spawnServer`/`warmUp` mutually re-invoking via `setTimeout`; rationale recorded (`process-crash-backstop.md`) but interleaving correctness is verifiable only by manual trace. (Flagged by all 4 auditors.)
- `[prior]` **`src/lib/plaid.ts` remains a 303-line multi-responsibility module** (env validation, client construction, retry policy, type adapters, seven operations). `plaid-module-seams.md`'s 400-line split trigger has no mechanical enforcement. (Flagged by all 4 auditors.)
- `[new]` **`useAsyncAction` mixes per-key and global state inconsistently.** Errors are tracked per run-key in a `Map` (`src/hooks/useAsyncAction.ts:14`, explicitly commented as such) while `pending` (line 52) derives from one shared `pendingCount` across all keys. A caller seeing the per-key error design reasonably assumes `pending` is per-key too; it isn't — and this asymmetry is the root cause of the multi-institution "Remove" defect tracked under interaction capability. Reused by 4 call sites; nothing (types or tests) catches misuse on reuse. (Flagged by 1 of 4 auditors.)

# Minor Concerns

- `[prior]` **No `max-lines`/`complexity` lint guardrail** — file/function growth is caught only by manual audit, unlike every other design rule which runs in `npm run lint`.
- `[prior]` **Concurrency/ordering invariants enforced only by comments, not types** — `category-write-state.ts:24-36` (`recordCommit`/`settleIfDone` silently no-op without a prior `joinBurst`) and `useLoadProtocol.ts:41-42` (prose-only caller contract).
- `[prior]` **`AccountView` concentrates cross-hook wiring behind an unenforced sharing contract** — `src/app/accounts/[accountId]/page.tsx:98-153` threads one `CategoryWriteState` into multiple flows; correctness rests entirely on this file's wiring.
- `[prior]` **Near-identical names across the card domain** — `cards.ts` (matching), `card-catalog.ts` (loading), `card-types.ts` (constants); filenames alone don't distinguish responsibility.
- `[prior]` **Three similarly named error-message helpers across three files** — `errorMessage` (`http.ts:3`), `publicErrorMessage` (`errors.ts:35`), `plaidErrorMessage` (`plaid-errors.ts:39`).
- `[prior]` **Three near-duplicate "skipped sync" message formatters** — `sync-messages.ts:5-43`, same held-vs-dropped policy hand-encoded in three prose templates.
- `[prior]` **`storeItem`'s three-way conditional-spread merge is dense** — `link.ts:61-104`; its "failed metadata fetch never nulls a stored value" invariant is only verifiable by tracing spread precedence.
- `[prior]` **`SingletonKey` is a required edit point for every new process-wide singleton** — `global-singleton.ts:9-17`, 8 keys.
- `[prior]` **`scripts/start.mjs` hand-rolls Next's CLI port-parsing** — can silently drift from Next's actual parsing across version bumps; no `Verified-on:` coverage.
- `[prior]` **Duplicated rationale prose for `AccountPayload.itemError`** — `api-types.ts:33-35` and the accounts route handler both explain the same design.
- `[prior]` **No CI** — no `.github/workflows`, no active git hooks; quality gates run only via local `prebuild`, which `npm run dev` bypasses.
- `[new]` **`sync-failure.ts`/`sync-outcome.ts` naming mismatch** — `sync-failure.ts` (6 lines) holds only the `isSyncFailure` type guard while `recordSyncFailure` lives in `sync-outcome.ts:10`; searching by name lands in the wrong file. (Flagged by 1 of 4 auditors.)
- `[new]` **The `format:check` gate is wired into no script and drift has accumulated** — `npx prettier --check .` fails on 40 files (`eslint.config.mjs` plus 39 markdown files under `.claude/`, none excluded via `.prettierignore`); the gate exists in `package.json` but nothing runs it — a concrete present-day symptom of the no-CI gap. (Flagged by 1 of 4 auditors.)
