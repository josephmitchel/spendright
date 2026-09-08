---
characteristic: "flexibility"
---
# Summary

Four auditors reviewed the codebase against ISO/IEC 25010:2023 §3.8 (adaptability, scalability, installability, replaceability). None found a Major concern, and all four respected the recorded, revisit-triggered trade-offs in `deployment-boundaries.md`, `scheduled-sync.md`, `single-card-catalog.md`, and related records (no tenant scoping, offset pagination, single-process scheduler state, fixed sync cadence, code-only catalog recovery). Two prior-round fixes were independently verified: `CardType` is now compiler-exhaustive (`RATE_HEADERS ... satisfies Record<CardType, string>`, `src/app/accounts/[accountId]/TransactionTable.tsx`), and pool sizing is now an explicit, shared, arithmetic-justified `max: 10` in `src/lib/pool-config.ts` with its coupling to `SYNC_CONCURRENCY` recorded.

One auditor raised a Moderate concern (no data-export path) that the others did not contradict; the recurring Minor theme across auditors is that a handful of adaptability/replaceability trade-offs are real-but-reasonable yet *unrecorded*, unlike the project's other accepted boundaries.

# Major Concerns

None.

# Moderate Concerns

- **No data export or backup path — user financial data has no exit route from the app** (1/4 auditors) — There is no CSV/JSON export endpoint, no dump script, and no documented way to extract transaction history, category assignments, or the card catalog other than raw SQL (verified: none of the 10 API route files export, and no `csv|download|Export` hits across `src`). ISO replaceability exists specifically to reduce lock-in via standardized formats, and the manually categorized, historically snapshotted data (`categorization-is-a-historical-snapshot.md`) exists nowhere else — Plaid doesn't retain the user's categorization choices. Unlike the accepted stage-gate boundaries, this has no design record at all, suggesting it hasn't been explicitly considered and deferred.

# Minor Concerns

- **Plaid Link `language` is hardcoded to `'en'`** (4/4) — `src/lib/plaid.ts:143`. In the same `createLinkToken` request, `products` and `country_codes` are env-driven and validated (`getEnvEnumList`, lines 87-112, per `config-validated-not-assumed`), but there is no `PLAID_LANGUAGE` knob and no record accepting the asymmetry. An operator can point `PLAID_COUNTRY_CODES` at non-English-speaking institutions and still get an English-only Link modal; adapting requires a source change, not a config change.

- **No provider-neutral seam for the account-linking flow / provider operations** (3/4) — The data layer has a clean adapter boundary (`src/lib/provider-types.ts`, `plaid-types-adapted-at-ingest`), but the connect UI (`src/app/PlaidLinkButton.tsx`, `src/hooks/usePlaidLinkOpen.ts` built directly on `react-plaid-link`, and the `linkToken`/`exchange` names in `src/lib/api-paths.ts`) is Plaid-vocabulary end to end, and the Plaid operations are plain exports from `src/lib/plaid.ts` imported directly by `sync.ts`, `items.ts`, `link.ts`, and the link-token route rather than sitting behind a `Provider` interface. Swapping or adding an aggregator means rewriting in place, not adding an implementation behind a seam. Distinct from `plaid-module-seams.md`, which covers internal file-splitting, not vendor replaceability. Normal shape for a single-aggregator tool — but unlike comparable decisions, no design record names it as accepted.

- **Cross-process sync correctness is bound to a Postgres-only primitive** (2/4) — `src/lib/sync-lock.ts:21` uses `pg_advisory_lock(hashtextextended(...))` via raw SQL — the one piece of the app not portable to another SQL engine. `postgres-version-floor.md` records the *version* dependency but not the *vendor* dependency. Abstracting now would be premature; a one-line design-record acknowledgment (or a `deployment-boundaries.md` entry with an engine-swap revisit trigger) would keep future audits from rediscovering it.

- **Several operational bounds are fixed in code with no environment override** (1/4) — `PLAID_TIMEOUT_MS` (60s), `SYNC_PAGE_SIZE` (500), `MAX_SYNC_PAGES` (200), retry delays (`src/lib/plaid.ts:56,118,237-244`), and `REQUEST_TIMEOUT_MS` (120s, `src/lib/http.ts:8`). `requests-have-deadlines.md` justifies the values but not their non-configurability — unlike `scheduled-sync.md`, which explicitly weighed and rejected configurability for the sync cadence. Adapting these budgets to a slower network or different Plaid tier requires a code change with no record stating that trade-off was considered.
