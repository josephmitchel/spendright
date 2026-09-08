---
characteristic: "flexibility"
---
# Summary

All four auditors confirmed the prior Moderate (no recorded data-export decision) remains resolved — the deferral survived the design-folder compaction intact as the "Data export deferred" section of `deferred-features.md`, revisit triggers included. The three prior Minors remain open, though one (the Plaid-vocabulary connect UI) is weakening: `plaid-types-adapted-at-ingest.md` now explicitly records "no second provider is planned," and one auditor judged that sufficient closure while the other three carried it open because the record covers the ingest seam, not the connect UI/route layer. It is kept open here per the majority, but is the top candidate for closure next cycle if the non-goal is extended to cover the UI/route layer explicitly. One new Minor surfaced: `scripts/start.mjs`'s timing constants share the "fixed bounds, no recorded rationale" pattern already flagged for `plaid.ts`/`http.ts`. Independent sweeps of installability, scalability, locale/currency handling, and catalog/category extensibility found nothing else — the apparent gaps there are all recorded, revisit-triggered decisions (`deployment-boundaries.md`, `single-user-localhost-no-auth.md`, `card-catalog-in-code.md`, `scheduled-sync.md`).

Totals: 0 Major, 0 Moderate, 4 Minor (3 prior, 1 new).

# Major Concerns

None.

# Moderate Concerns

None.

# Minor Concerns

- `[prior]` **Plaid Link `language` hardcoded to `'en'`.** `src/lib/plaid.ts:162` — a bare literal in `createLinkToken` while sibling fields (`products`, `country_codes`) are env-driven and validated via `getEnvEnumList`; no `PLAID_LANGUAGE` knob and no design record accepting the asymmetry. (Flagged by all 4 auditors.)

- `[prior]` **No provider-neutral seam for the account-linking flow.** `PlaidLinkButton.tsx`, `usePlaidLinkOpen.ts` (wrapping `react-plaid-link`), and the `/api/link-token` / `/api/exchange` routes remain Plaid-vocabulary end to end, with Plaid operations as plain imports rather than behind a `Provider` interface. `plaid-types-adapted-at-ingest.md` now records multi-provider as a non-goal for the ingest layer, which narrows this finding's force — but the connect UI/route layer has no equivalent statement of its own. Candidate for closure next cycle if the recorded non-goal is extended to cover it. (Kept open by 3 of 4 auditors; 1 judged the recorded non-goal sufficient.)

- `[prior]` **Several operational bounds fixed in code with no environment override.** `PLAID_TIMEOUT_MS` (60s), `SYNC_PAGE_SIZE` (500), `MAX_SYNC_PAGES` (200), and the retry/poll budgets in `src/lib/plaid.ts`; `REQUEST_TIMEOUT_MS` (120s) in `src/lib/http.ts:8`; `SYNC_CONCURRENCY` (3) in `src/lib/sync-all.ts:32`; `POOL_CONFIG.max` (10) in `src/lib/pool-config.ts:13`. The design records justify the chosen values but not their non-configurability — unlike `scheduled-sync.md`, which explicitly considered and rejected a config knob for its own interval. (Flagged by all 4 auditors.)

- `[new]` **`scripts/start.mjs` timing constants are bare literals with no recorded rationale.** Restart-after-crash delay (1000ms), crash-loop window (60,000ms) and threshold (3 starts), warm-up deadline (60,000ms), and warm-up poll interval (250ms) are all hardcoded with no env override and — unlike the `plaid.ts`/`http.ts` constants — no design record discussing the values or their non-tunability. Same category as the prior finding above; a good candidate to fold into it or into `requests-have-deadlines.md`.
