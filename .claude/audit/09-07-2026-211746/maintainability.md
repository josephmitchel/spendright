---
characteristic: "maintainability"
---
# Summary

Maintainability remains the heaviest backlog in the codebase, and the only characteristic where an auditor surfaced a new Moderate. The prior audit's newest Moderate — `useAsyncAction`'s per-key/global-pending asymmetry — was genuinely fixed in commit `da6bbb8` (all four auditors verified `pendingKeys` reaches the real call site). But the three older Moderates are all still open, and two of them measurably worsened: `plaid.ts` grew 303 → 321 lines (the 429 retry landed there rather than being split out), and the design-record corpus grew to 93 records against ~82 source files. `format:check` drift also worsened concretely (40 → ~50 files, including `src/lib/money.ts`, which landed pre-drifted in the same commit — proof the unwired gate is costing new code, not just stale docs).

One new Moderate: the design-record consistency tooling validates that record tags name real code, but nothing validates the reverse — and the two records added this very commit (`money-formatted-with-intl.md`, `card-rates-provenance.md`) already lack any `Design:` back-reference in the code they describe. Three new Minors round it out. All quality gates that exist (`tsc`, `eslint`, the three design-consistency scripts, `madge --circular`) pass cleanly.

Totals: 0 Major, 4 Moderate (3 prior + 1 new; 1 prior resolved this cycle), 16 Minor (13 prior + 3 new).

# Major Concerns

None.

# Moderate Concerns

- `[prior]` **Design-record corpus continues to outgrow the codebase.** `.claude/design/current/` holds 93 records against ~82 files under `src/` (was 88/80) — the ratio worsened. Kept honest only by custom regex/text meta-tooling (`check-design-refs.mjs`, `check-record-tags.mjs`, `check-verified-claims.mjs`) that itself has no test coverage. A compounding analysability trend.
- `[prior]` **`scripts/start.mjs` is an untested, stateful process supervisor.** 118 lines of module-level mutable state (`recentStarts`/`shuttingDown`/`child`), a sliding-window crash-loop guard, and `spawnServer`/`warmUp` mutually re-invoking via `setTimeout`; interleaving correctness is verifiable only by manual trace.
- `[prior]` **`src/lib/plaid.ts` remains a multi-responsibility module — and grew.** Now 321 lines (was 303; the `Retry-After` handling landed here): env validation, client construction, retry policy, type adapters, and seven operations in one file. `plaid-module-seams.md`'s 400-line split trigger has no mechanical enforcement.
- `[new]` **Design-record back-references have a demonstrated blind spot.** `check-record-tags.mjs` validates that a record's tags name something real in the tree, but nothing validates that code a record describes carries a `Design:` comment pointing back. Both records added in `da6bbb8` already violate this: `money-formatted-with-intl.md` names `src/lib/money.ts` and `card-rates-provenance.md` names `cards.seed.ts`/`seed-cards.ts`, yet none of those files reference the records. A maintainer reading the code has no in-code signal the "why" is recorded.

# Minor Concerns

- `[prior]` **No `max-lines`/`complexity` lint guardrail** — file/function growth is caught only by manual audit, unlike every other design rule enforced in `npm run lint`.
- `[prior]` **Concurrency/ordering invariants enforced only by comments, not types** — `category-write-state.ts` (`recordCommit`/`settleIfDone` silently no-op without a prior `joinBurst`) and `useLoadProtocol.ts:41-42` (prose-only caller contract).
- `[prior]` **`AccountView` concentrates cross-hook wiring behind an unenforced sharing contract** — `src/app/accounts/[accountId]/page.tsx` threads one `CategoryWriteState` through multiple flows by convention only.
- `[prior]` **Near-identical names across the card domain** — `cards.ts` / `card-catalog.ts` / `card-types.ts`; filenames alone don't distinguish responsibility.
- `[prior]` **Three similarly named error-message helpers across three files** — `errorMessage` (`http.ts:3`), `publicErrorMessage` (`errors.ts:35`), `plaidErrorMessage` (`plaid-errors.ts:39`).
- `[prior]` **Three near-duplicate "skipped sync" message formatters** — `sync-messages.ts` hand-encodes the same held-vs-dropped policy in three prose templates.
- `[prior]` **`storeItem`'s three-way conditional-spread merge is dense** — `link.ts:64+`; the "failed metadata fetch never nulls a stored value" invariant is verifiable only by tracing spread precedence.
- `[prior]` **`SingletonKey` is a required edit point for every new process-wide singleton** — `global-singleton.ts:9-17`, 8 keys.
- `[prior]` **`scripts/start.mjs` hand-rolls Next's CLI port-parsing** — can silently drift from Next's actual parsing across version bumps; no `Verified-on:` coverage.
- `[prior]` **Duplicated rationale prose for `AccountPayload.itemError`** — `api-types.ts:33-35` and `src/app/api/accounts/[accountId]/route.ts:16-17`.
- `[prior]` **No CI** — no `.github/workflows`, no active git hooks; quality gates run only via local `prebuild`, which `npm run dev` bypasses.
- `[prior]` **`sync-failure.ts`/`sync-outcome.ts` naming mismatch** — `isSyncFailure` lives in the former while `recordSyncFailure` lives in the latter.
- `[prior]` **`format:check` wired into no script, and drift worsened.** `npx prettier --check .` now fails on ~48-53 files (was 40), including the brand-new `src/lib/money.ts` — new code is landing pre-drifted because nothing runs the gate.
- `[new]` **`useAsyncAction`'s dual `pending`/`pendingKeys` return has no type-level link to the `key` option.** The multi-institution Remove defect is fixed at today's call sites, but nothing stops the next keyed caller from reading the aggregate `pending` with no compiler signal — the defect class is mitigated, not structurally prevented.
- `[new]` **`sync-lock.ts`'s `query_timeout` fix casts through an untyped `pg` internal.** `as QueryConfig & { query_timeout: number }` removes compiler protection on the exact mechanism that keeps the sync lock's 503 path working; only the prose `Verified-on:` comment guards against drift. (Same underlying issue as compatibility's new finding on the unpinned `pg` caret range — flagged here for the type-safety/analysability angle.)
- `[new]` **Three unused exports (dead public surface).** `knip` flags `POOL_CONFIG` (`pool-config.ts:12`), `ACCOUNT_REFRESH_FAILED_MESSAGE` (`sync-outcome.ts:30`), and `SyncItemFailure` (`sync-all.ts:13`) as exported but never imported elsewhere — the `export` keyword overstates their status as cross-module contracts.
