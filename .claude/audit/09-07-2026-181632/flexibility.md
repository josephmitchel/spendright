---
characteristic: "flexibility"
---
# Summary

Four auditors assessed flexibility (ISO/IEC 25010:2023 §3.8: adaptability, scalability, installability, replaceability). All four verified that the prior round's findings are fixed (key rotation, the Windows-compatible build pipeline, bounded sync concurrency, the single-source `CardType` enum) or formally accepted with revisit triggers (`deployment-boundaries.md`, `cross-process-sync-lock.md`), and none re-raised those. The ingest-time provider adapter, fail-closed env-driven config, and the `CategoryKind` exhaustiveness machinery were repeatedly cited as strengths. Remaining findings are small and highly convergent — the same four items surfaced across three to four agents each.

# Major Concerns

None.

# Moderate Concerns

- **`CardType` branch is not compiler-exhaustive, unlike its sibling `CategoryKind`** (3/4 auditors; 1 rated moderate) — `src/app/accounts/[accountId]/TransactionTable.tsx:95-96`: `card.type === 'points' ? 'Multiplier' : 'Cashback %'`. `CategoryKind` — also a two-member union — was deliberately reworked (`category-kind-exhaustive.md`, `assertNeverKind`) precisely because "a third kind would silently fall into every else," but `CardType` (`src/lib/card-types.ts`) was not brought under the same rule. Adding a plausible third reward type (e.g. miles) would silently render "Cashback %" instead of failing to compile. The project has already set the precedent that this exact pattern is worth fixing.

# Minor Concerns

- **Plaid Link `language` is hardcoded to `'en'`** (4/4 auditors) — `src/lib/plaid.ts:143`. `country_codes` and `products` in the same request are env-driven and validated via `getEnvEnumList`, but there is no `PLAID_LANGUAGE` knob and no design record accepting the asymmetry. Adapting to a non-English locale requires a code change.

- **`pg.Pool` sizing is not configurable** (4/4 auditors) — `src/lib/db.ts:23-31` sets timeouts but no `max`, silently inheriting `pg`'s default of 10, with no env override in `.env.example`/`env.ts`. `SYNC_CONCURRENCY = 3` is kept "well below the pool max (10)" by comment convention only — the two are coupled by an unstated constant rather than a shared, adjustable value. (The reliability report's pool-headroom finding makes this coupling more than cosmetic.)

- **No provider-neutral seam for the account-linking flow** (3/4 auditors) — `src/app/PlaidLinkButton.tsx`, `src/hooks/usePlaidLinkOpen.ts` (direct `usePlaidLink`), and the `linkToken`/`exchange` routes in `src/lib/api-paths.ts` are Plaid-vocabulary end to end, in contrast to the clean data adapter in `provider-types.ts`. Replacing or adding an aggregator means rebuilding the connect flow, not swapping an adapter. Bespoke connect widgets are normal for this category, so this is a named lock-in point rather than a defect — but no design record acknowledges it as an accepted trade-off.

- **Operational tuning values are fixed in-code constants** (2/4 auditors) — scheduler cadence (`sync-scheduler.ts:9-10`), poll interval (`useVisiblePoll.ts`), and Plaid budgets/timeouts (`PLAID_TIMEOUT_MS`, `SYNC_PAGE_SIZE`, `MAX_SYNC_PAGES`, retry delays) have no env overrides. `scheduled-sync.md` justifies the in-process-timer mechanism but not the specific values. Adapting cadence or budgets to a different workload requires a source change and redeploy.
