---
characteristic: "maintainability"
---
# Summary

The prior Moderate backlog shrank substantially this cycle. Three of the four prior Moderates are resolved: the design-record corpus was compacted (93 records → 62 vs 81 source files, with a governing "extend, don't add" policy in `design-corpus-compaction.md`); the back-reference blind spot is closed (`check-design-refs.mjs` now validates both directions, wired into `npm run lint`, and the two previously-uncited records now carry `Design:` markers); and `plaid.ts`'s multi-responsibility growth now has both a mechanical `max-lines: 400` guardrail and a user-confirmed recorded deferral of the split in `plaid-module-seams.md` (two auditors would still keep this open — the file sits at 322/400 lines and the rule only catches future growth — but the recorded, confirmed decision closes it per the repo's own convention). One prior Minor (no size guardrail) is also resolved by the same ESLint rule. One Moderate remains open, 15 prior Minors are unchanged, and one new Minor was found: the repo's dependency-cycle gate silently produces a false pass when invoked the way prior audits describe.

All quality gates (`tsc`, `eslint` + design scripts, `madge --circular` when invoked correctly, `knip`) pass cleanly.

Totals: 0 Major, 1 Moderate (prior), 16 Minor (15 prior, 1 new).

# Major Concerns

None.

# Moderate Concerns

- `[prior]` **`scripts/start.mjs` is an untested, stateful process supervisor.** 118 lines of module-level mutable state (`recentStarts`/`shuttingDown`/`child`), a sliding-window crash-loop guard, and `spawnServer`/`warmUp` mutually re-invoking via `setTimeout`; interleaving correctness is verifiable only by manual trace. Unchanged since the last audit. (Flagged by all 4 auditors.)

# Minor Concerns

- `[prior]` **`format:check` is wired into no script, and drift persists.** `npx prettier --check .` reports 58 failing files this cycle (raw count inflated by concurrent audit-report writes into `.claude/audit/`; the substantive signal is that the same core files remain dirty and newly-edited files — `eslint.config.mjs`, `src/lib/money.ts` — landed pre-drifted). Nothing in `lint`, `prebuild`, or `dev` runs the gate. One auditor rated the worsening trend Moderate; kept Minor here consistent with the prior cycle, but this is the one item that visibly regresses each audit.
- `[prior]` **Concurrency/ordering invariants enforced only by comments, not types** — `category-write-state.ts` (`recordCommit`/`settleIfDone` silently no-op without a prior `joinBurst`) and `useLoadProtocol.ts:41-42` (prose-only caller contract).
- `[prior]` **`AccountView` concentrates cross-hook wiring behind an unenforced sharing contract** — `src/app/accounts/[accountId]/page.tsx` threads one `CategoryWriteState` through multiple hooks by convention only.
- `[prior]` **Near-identical names across the card domain** — `cards.ts` / `card-catalog.ts` / `card-types.ts`.
- `[prior]` **Three similarly named error-message helpers** — `errorMessage` (`http.ts:3`), `publicErrorMessage` (`errors.ts:35`), `plaidErrorMessage` (`plaid-errors.ts:39`).
- `[prior]` **Three near-duplicate "skipped sync" message formatters** — `sync-messages.ts` hand-encodes the same held-vs-dropped policy in three prose templates.
- `[prior]` **`storeItem`'s three-way conditional-spread merge is dense** — `link.ts:64+`; the "failed metadata fetch never nulls a stored value" invariant is verifiable only by tracing spread precedence.
- `[prior]` **`SingletonKey` is a required edit point for every new process-wide singleton** — `global-singleton.ts:9-17` (8 keys).
- `[prior]` **`scripts/start.mjs` hand-rolls Next's CLI port-parsing** — can silently drift from Next's parsing across version bumps; no `Verified-on:` coverage (a new comment notes the parsed port is re-passed as a trailing `-p`, which bounds the damage but doesn't remove the drift risk).
- `[prior]` **Duplicated rationale prose for `AccountPayload.itemError`** — `api-types.ts:33-35` and `src/app/api/accounts/[accountId]/route.ts:16-17`.
- `[prior]` **No CI** — no `.github/workflows`, no active git hooks; quality gates run only via local `prebuild`, which `npm run dev` bypasses.
- `[prior]` **`sync-failure.ts`/`sync-outcome.ts` naming mismatch** — `isSyncFailure` lives in the former, `recordSyncFailure` in the latter.
- `[prior]` **`useAsyncAction`'s dual `pending`/`pendingKeys` return has no type-level link to the `key` option** — `src/hooks/useAsyncAction.ts`.
- `[prior]` **`sync-lock.ts:37` casts through an untyped `pg` internal** (`as QueryConfig & { query_timeout: number }`), guarded only by a prose `Verified-on:` comment.
- `[prior]` **Three unused exports (dead public surface)** per `knip`: `POOL_CONFIG` (`pool-config.ts:12`), `ACCOUNT_REFRESH_FAILED_MESSAGE` (`sync-outcome.ts:30`), `SyncItemFailure` (`sync-all.ts:13`).
- `[new]` **`madge --circular` silently no-ops without `--extensions`, and isn't wired into any script.** The invocation prior audits describe (`npx madge --circular src`) processes 0 files and prints "No circular dependency found!" — a false-clean pass. The correct form (`--extensions ts,tsx`) processes all 81 files, but that flag is recorded nowhere (`package.json`, scripts, design records), so future runs of the one dependency-cycle gate can silently pass on nothing.
