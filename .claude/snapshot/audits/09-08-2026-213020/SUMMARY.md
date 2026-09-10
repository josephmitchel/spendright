# Audit Summary — 09-08-2026-213020

Second audit of the current snapshot era. 27 auditors ran (3 per ISO/IEC 25010:2023 requirement), re-verifying the 9 open concerns from `09-08-2026-210043` before hunting fresh.

## Main takeaways

**All nine prior concerns were verified resolved** — every auditor assigned to a prior concern independently confirmed the fix in the current working tree, and each fix matched the originally suggested direction:

- The post-link "first sync didn't finish" prefix is now gated on `sync_error` (`PlaidLinkButton.tsx`).
- Every Plaid call now routes through `retryOnce()` (`plaid.ts`), making the one-bounded-retry policy uniform.
- All five outcome states are inside live regions; "Sync all" attributes every count to its institution; the category-pick irreversibility warning is surfaced via `title`/accessible description.
- `assertPlaidErrorExtraction()` startup canary added (`plaid-error-check.ts`, wired into `instrumentation.ts`).
- Row and count queries run under `Promise.all` (`transactions.ts`).
- `CategoryWriteState` documents its caller contract; the seed backfill moved into one-time migration `0009`.

**Newly surfaced: 3 concerns, none major.** Notably, two of them are residues of the very pattern the prior fixes established — the fixes were correct but didn't sweep the whole codebase for their own pattern:

- `remaining-live-region-gaps` (moderate) — the stale-categories notice and the pager's "Showing X–Y of Z" range still sit outside live regions, the two spots the outcome-states fix didn't touch.
- `dep-shape-assumptions-lack-canaries` (minor) — `pgErrorCode`, the Plaid transient-failure detection, and the pg date-parser override rest on `Verified-on:` comments with no startup canary, and `drizzle-orm`/`pg`/`plaid` are caret-ranged unlike the exact-pinned `axios` — the same risk class the new Plaid-error canary guards, in three more places.
- `dotenv-script-log-noise` (minor) — dotenv promotional tips pollute seed/rotation script output; one-line `{ quiet: true }` fix.

Otherwise the audit was strikingly clean: security, safety, flexibility, functional suitability, performance efficiency, and reliability all came back with zero open findings across all three of their auditors, repeatedly noting the implementation matches SNAPSHOT.md line-for-line and that the "Intentionally absent / deferred" section already accounts for everything else.

## Score

Score: 4 (prior: 0, new: 4) — resolved this audit: 9

| Level     | Count      | Points |
| --------- | ---------- | ------ |
| Major     | 0          | 0      |
| Moderate  | 1          | 2      |
| Minor     | 2          | 2      |
| **Total** | **3 open** | **4**  |

Down from 13 last audit — the entire prior backlog cleared, with only follow-on residue and one cosmetic script issue remaining.
