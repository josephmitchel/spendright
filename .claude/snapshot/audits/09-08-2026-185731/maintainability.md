---
characteristic: 'maintainability'
---

# Summary

Three auditors read essentially the entire application (~4,300 lines) and ran the toolchain independently. The verdict is consistent: unusually well-maintained for its stage — `lint` and `typecheck` pass clean, zero circular dependencies (`madge`), zero `any`/suppressions beyond one justified `eslint-disable`, cohesive single-purpose modules with no backward `src/app → src/lib` violations, all cross-request mutable state routed through the closed `SingletonKey` union, thin API routes uniformly wrapped in `withErrorResponse`, the `Verified-on:` comment convention followed exactly, and README/SNAPSHOT both accurate against the code. The only findings are two housekeeping items. All findings are `[new]` (first audit of the era). Missing tests were excluded per the user's standing deferral.

# Major Concerns

None.

# Moderate Concerns

None.

# Minor Concerns

- `[new]` **Prettier formatting drift has accumulated and nothing enforces `format:check`.** All three auditors converged on this. `package.json` defines `format`/`format:check`, but `prebuild` only runs `tighten-next.mjs && lint && typecheck`, the sole git hook checks only SNAPSHOT.md freshness, and there is no CI. `npm run format:check` currently fails on real source files (`src/proxy.ts`, `src/lib/env.ts`, `src/lib/http.ts`, `src/lib/money.ts`, `src/lib/pagination.ts`, `src/lib/plaid-errors.ts`, `src/lib/sync-all.ts`, `src/instrumentation.ts`, `src/app/accounts/[accountId]/page.tsx`, `eslint.config.mjs`, plus assorted config/markdown). The drift itself is trivial (stray blank lines, one collapsible signature in `money.ts`), but unenforced it will grow, and future diffs will mix formatting noise into substantive changes — against analysability in a repo whose stated goal is agent-maintained uniformity. Cheap fix: run `format` once to clear the drift and add `format:check` to `prebuild`.

- `[new]` **A few exports are unused outside their declaring file.** `knip` flags `POOL_CONFIG` (`src/lib/pool-config.ts:11`), `ACCOUNT_REFRESH_FAILED_MESSAGE` (`src/lib/sync-outcome.ts:29`), and `SyncItemFailure` (`src/lib/sync-all.ts:12`) as exported but consumed only within their own files. Cosmetic widening of each module's public surface; the fix is a one-word `export` removal in each case.
