---
characteristic: 'maintainability'
---

# Summary

All three auditors re-ran the full toolchain (`lint`, `typecheck`, `format:check`, `knip`, `madge --circular`, `jscpd`) and manually reviewed module boundaries, the comment policy, and the code added in commit `fbf2912`. The verdict is unchanged: an unusually well-maintained codebase for its stage — lint/typecheck clean, no circular dependencies, zero code clones, no TODO/FIXME markers, exactly one pre-existing justified `eslint-disable`, all `Verified-on:` comments compliant, no file near the 400-line ceiling, and the merge-gate hook correctly wired. The two prior Minor concerns remain open (one partially resolved: `ACCOUNT_REFRESH_FAILED_MESSAGE` is now consumed and no longer flagged by knip). One auditor surfaced a new Minor introduced by the `fbf2912` fix commit itself: the chunk-size constant extracted into `src/lib/chunk.ts` duplicates rather than replaces `sync-persist.ts`'s own `UPSERT_CHUNK_SIZE`. (Note: flexibility auditors independently found the same duplication; it is reported in both characteristics.)

# Major Concerns

None.

# Moderate Concerns

None.

# Minor Concerns

- `[prior]` **Prettier formatting drift is unenforced and has grown** (`package.json`, `scripts/git-hooks/pre-merge-commit`). `npm run format:check` still fails on the same 10 source files previously flagged (`src/proxy.ts`, `src/lib/env.ts`, `src/lib/http.ts`, `src/lib/money.ts`, `src/lib/pagination.ts`, `src/lib/plaid-errors.ts`, `src/lib/sync-all.ts`, `src/instrumentation.ts`, `src/app/accounts/[accountId]/page.tsx`, `eslint.config.mjs`) plus a new batch of `.claude/**` markdown — 33 files total, up from ~15. `prebuild` still runs only `tighten-next.mjs && lint && typecheck`, and the sole git hook checks only SNAPSHOT freshness. Cosmetic today, but the growth confirms the original concern: unenforced formatting mixes noise into future diffs. Cheap fix: run `format` once, add `format:check` to `prebuild`.

- `[prior]` **Unused exports, partially resolved** (`src/lib/pool-config.ts:17`, `src/lib/sync-all.ts:12`). `knip` still flags `POOL_CONFIG` and `SyncItemFailure` as exported but consumed only within their declaring files. The third previously-flagged item, `ACCOUNT_REFRESH_FAILED_MESSAGE`, is resolved (now imported by `src/lib/sync-outcome.ts`). Fix remains a one-word `export` removal each.

- `[new]` **Two unlinked copies of the 500-row chunk magic number** (`src/lib/chunk.ts:3`, `src/lib/sync-persist.ts:43`). `chunk.ts` (added in `fbf2912`) exports `ID_CHUNK_SIZE = 500` with a comment claiming it "matches UPSERT_CHUNK_SIZE so there is one number to reason about," but `sync-persist.ts` still defines its own separate `UPSERT_CHUNK_SIZE = 500` with a manual `.slice()` loop. Nothing enforces the stated invariant, so a future change to either bind-parameter budget can silently desync from the other — undercutting exactly the goal the extraction was meant to serve. Fix: have `sync-persist.ts` import `ID_CHUNK_SIZE`/`chunkArray` from `chunk.ts`.
