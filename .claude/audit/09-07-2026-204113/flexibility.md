---
characteristic: "flexibility"
---
# Summary

All four auditors agree: no Major concerns, one Moderate and three Minor concerns — all prior and unaddressed — and no new findings from independent sweeps of installability, scalability, locale/currency handling, and vendor lock-in surfaces. One prior Minor is resolved: the Postgres-only sync-lock primitive is now explicitly recorded as a deployment constraint with a revisit trigger in `cross-process-sync-lock.md` (3 of 4 auditors confirm this satisfies what the prior finding asked for). The design-record discipline continues to keep flexibility trade-offs mostly accounted for; the same small, real gaps persist untouched.

# Major Concerns

None.

# Moderate Concerns

- `[prior]` **No data export or backup path for user financial data.** No CSV/JSON export endpoint or dump script exists anywhere in `src/app/api/*`; the manually categorized, historically-snapshotted transaction data (`categorization-is-a-historical-snapshot.md`) exists nowhere else and cannot be extracted except via raw SQL. Unlike comparable stage-gate boundaries, no design record acknowledges this as an accepted deferral — a direct replaceability/lock-in concern under ISO §3.8. (Flagged by all 4 auditors.)

# Minor Concerns

- `[prior]` **Plaid Link `language` hardcoded to `'en'`.** `src/lib/plaid.ts:143` — `products`/`country_codes` in the same request are env-driven and validated, but there is no `PLAID_LANGUAGE` knob and no record accepting the asymmetry; non-English institutions get an English-only Link modal without a source change.
- `[prior]` **No provider-neutral seam for the account-linking flow.** The data layer has a clean adapter boundary (`provider-types.ts`), but the connect UI (`PlaidLinkButton.tsx`, `usePlaidLinkOpen.ts` on `react-plaid-link`) and route naming (`linkToken`/`exchange`) are Plaid-vocabulary end to end; Plaid operations are plain exports imported directly rather than sitting behind a `Provider` interface. `plaid-types-adapted-at-ingest.md` scopes itself to the ingest adapter only; swapping/adding an aggregator means rewriting in place.
- `[prior]` **Several operational bounds fixed in code with no environment override.** `PLAID_TIMEOUT_MS` (60s), `SYNC_PAGE_SIZE` (500), `MAX_SYNC_PAGES` (200), retry delays, and `REQUEST_TIMEOUT_MS` (120s, `src/lib/http.ts:8`) are bare constants. `requests-have-deadlines.md` justifies the values but not their non-configurability — unlike `scheduled-sync.md`, which explicitly considered and rejected configurability for sync cadence.

## Resolved since prior audit

- **Cross-process sync correctness bound to a Postgres-only primitive** — `cross-process-sync-lock.md` now carries an explicit dated "Deployment constraint" section naming the session-mode/vendor dependency and its revisit trigger; exactly the acknowledgment the prior finding asked for (3 of 4 auditors concur).
