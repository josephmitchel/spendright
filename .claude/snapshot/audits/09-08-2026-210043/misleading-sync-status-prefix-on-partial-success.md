---
characteristics: [functional-suitability]
level: moderate
status: new
first-seen: 09-08-2026-210043
locations:
  - src/app/PlaidLinkButton.tsx:34
  - src/lib/link.ts:179
---

# Misleading "first sync didn't finish" prefix on successful post-link syncs

The post-link status notice in `PlaidLinkButton.tsx` gates its prefix on `!data.setup_failed`, but the `notices` array can be non-empty for reasons unrelated to the sync failing: skipped/held rows for unmatched accounts (`skipped > 0`, a normal successful-sync outcome) and account-store failures during enrichment (`account_errors`, populated in `link.ts` independently of whether `runInitialSync` succeeded). Since `sync_error` is null whenever the sync completed without throwing, a link with a fully successful first sync can still show "Connected, but the first sync didn't finish: " in front of a notice actually describing held rows or an unrelated account-store failure. The UI asserts something false about a financial data sync, which could lead the user to distrust or manually retry a sync that already succeeded. Suggested direction: gate the prefix on `data.sync_error` being present (the actual "sync didn't finish" condition), e.g. `const prefix = data.sync_error ? "Connected, but the first sync didn't finish: " : ''`, leaving `setup_failed`'s own notice as the complete sentence it already is.
