---
characteristic: "flexibility"
---
# Summary

The prior audit's sole Moderate — no data export or backup path — is resolved this cycle via an explicit, user-confirmed deferral record: `.claude/design/current/data-export-deferred.md` (2026-09-07) accepts `pg_dump`/raw SQL as the interim extraction path while the operator is the developer, with concrete revisit triggers (accumulated categorization history worth protecting, a second non-developer user, or a Postgres migration). Three of four auditors verified the record directly (the fourth missed it; the record's existence was confirmed independently during synthesis).

The three prior Minors remain open — none of the files they cite changed this cycle. Note on the provider-seam finding: `plaid-types-adapted-at-ingest.md` was updated 2026-09-07 (user-confirmed) to state "This is a thin ingest seam, not a multi-provider abstraction — no second provider is planned," which one auditor read as resolving the finding; the majority kept it open because the connect UI and routes still have no seam should that non-goal ever change. It is carried open with that context — a candidate for closure next cycle if the recorded non-goal is judged sufficient acknowledgment.

Fresh sweeps across installability, scalability, vendor coupling beyond Plaid/Postgres, and locale/currency handling (the new `money.ts` is locale-adaptive, not hardcoded) found nothing new.

Totals: 0 Major, 0 Moderate (1 prior resolved this cycle), 3 Minor (all prior, 0 new).

# Major Concerns

None.

# Moderate Concerns

None open. `[prior — resolved]` No data export/backup path — now a recorded deliberate deferral in `data-export-deferred.md` with revisit triggers, closing the gap as originally framed (the absence of an acknowledged decision, not of a built feature).

# Minor Concerns

- `[prior]` **Plaid Link `language` hardcoded to `'en'`.** `src/lib/plaid.ts:161` — `products` and `country_codes` in the same request are env-driven and validated, but `language: 'en'` is a bare literal with no `PLAID_LANGUAGE` knob and no design record accepting the asymmetry.
- `[prior]` **No provider-neutral seam for the account-linking flow.** The data layer has a clean adapter boundary (`provider-types.ts`), but the connect UI (`PlaidLinkButton.tsx`, `usePlaidLinkOpen.ts` wrapping `react-plaid-link`) and route naming (`/api/link-token`, `/api/exchange`) remain Plaid-vocabulary end to end, with Plaid operations as plain imports rather than behind a `Provider` interface. See Summary note: the design record now explicitly declares multi-provider a non-goal.
- `[prior]` **Several operational bounds fixed in code with no environment override.** `PLAID_TIMEOUT_MS` (60s), `SYNC_PAGE_SIZE` (500), `MAX_SYNC_PAGES` (200) in `src/lib/plaid.ts`, and `REQUEST_TIMEOUT_MS` (120s) in `src/lib/http.ts` are bare constants (`SYNC_CONCURRENCY` and `POOL_CONFIG.max` are the same pattern). `requests-have-deadlines.md` justifies the values but not their non-configurability — unlike `scheduled-sync.md`, which explicitly considered and rejected a config knob.
