---
characteristic: "reliability"
---
# Summary

All four auditors confirmed the three prior Moderate concerns (sync-lock `query_timeout` race, unretried Plaid 429s, pool-usage comment undercount) remain resolved, and the same seven prior Minor concerns remain open — none touched since the last audit (the only interim changes were design-record comment annotations with no functional impact). Two auditors independently surfaced the same new finding: `createLinkToken` and `exchangePublicToken` lack the `retryOnce` wrapper applied to every other Plaid call. It is synthesized here as one new Moderate because `exchangePublicToken` (`src/lib/link.ts:152`) runs immediately after the user completes bank credential entry/OAuth in the external Plaid Link UI, and Plaid public tokens are single-use and short-lived — a transient 5xx there discards the token and forces the user to redo the entire linking flow. One auditor also noted the prior `getInstitutionById` half of the retry finding is lower-impact than described, since its sole call site already degrades gracefully.

Totals: 0 Major, 1 Moderate (new), 7 Minor (all prior).

# Major Concerns

None.

# Moderate Concerns

- `[new]` **`exchangePublicToken` and `createLinkToken` lack the `retryOnce` wrapper.** `src/lib/plaid.ts:157-168, 170-178` — unlike `getItem`/`getAccounts`/`transactionsSync`, neither retries transient failures. `exchangePublicToken` is the last step of the user-facing link flow; a single transient 5xx or dropped connection throws away the single-use, short-lived `public_token`, forcing the user to redo the entire external Plaid Link flow rather than the blip being absorbed as `transient-plaid-retry.md` intends for the sync path. `createLinkToken` has the same gap with lower impact (fails before the external UI opens; a button-click retry is cheap). (Flagged by 2 of 4 auditors; rated Moderate by one, Minor by the other — Moderate adopted given the concrete user impact.)

# Minor Concerns

All flagged by all 4 auditors:

- `[prior]` **`removeItem` and `getInstitutionById` lack the `retryOnce` wrapper.** `src/lib/plaid.ts:229-243, 250-253`. Note: `getInstitutionById`'s sole call site (`src/lib/link.ts:39-49`) already degrades gracefully to "no institution metadata," so `removeItem` is the higher-impact half — a transient blip during item deletion aborts the whole delete.

- `[prior]` **`items.error` collapses two independent failure signals into one column.** `src/lib/sync-outcome.ts:57-62` — writes either the skipped-rows message or `ACCOUNT_REFRESH_FAILED_MESSAGE`, never both, so one failure mode can mask the other on the same sync.

- `[prior]` **`listTransactions` reads the page and total count non-atomically.** `src/lib/transactions.ts:19-44` — two separate `SELECT`s with no shared snapshot; a concurrent sync commit between them can desync `total` from the returned page.

- `[prior]` **Item deletion is not atomic across Plaid and the local DB.** `src/lib/items.ts:31-55` (`removeItemCompletely`) — if `itemRemove` succeeds but `db.delete` fails, the row survives pointing at an invalidated token, self-healing only via a later `ITEM_NOT_FOUND` on manual retry.

- `[prior]` **No retry/backoff for a transiently unavailable Postgres at startup.** `src/instrumentation.ts:9-19` → `assertSupportedPostgres()` (`src/lib/db.ts:27-36`) treats any connection failure as immediately fatal; combined with `start.mjs`'s 3-restarts-in-60s budget, a co-started Postgres that's slow to become ready can exhaust the restart budget.

- `[prior]` **Crash-loop guard defeatable by a slow, persistent crash cycle.** `scripts/start.mjs:61-70` — restarts are counted in a rolling 60s window; a fault crashing the server every ~60-70s never trips the guard, so the supervisor restarts forever instead of surfacing the hard stop `process-crash-backstop` intends.

- `[prior]` **`scripts/rotate-encryption-key.ts` aborts the whole rotation on the first undecryptable row.** No try/catch around `decrypt(row.accessToken)` in the per-row loop (lines 28-44); one corrupted token blocks rotation for every item, unlike the per-row isolation pattern used in `storeAccounts` and `sync-all`.
