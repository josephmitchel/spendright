---
characteristic: "flexibility"
---
# Summary

All three auditors correctly excluded the recorded, user-confirmed scope decisions (single-card catalog, single-user/no-auth, fixed hourly sync, loopback-only bind, exact-name matching, unstyled UI) and converged on two structural findings: deep Plaid coupling with no provider seam (ranked major by one auditor, moderate by two), and the strictly sequential item sync as a scalability ceiling. Positives verified by multiple auditors: `PLAID_ENV`/products/country codes are env-driven and enum-validated, currency is read per-row rather than assumed USD, and `CategoryKind` exhaustiveness is compiler-enforced (a genuine adaptability strength).

# Major Concerns

- **No abstraction over the bank-data provider — vendor lock-in (Replaceability)** (flagged by all 3 auditors; one ranked it major) — Plaid SDK types are the working domain model, not an adapted boundary: `src/lib/sync.ts` imports `AccountBase` from `'plaid'`, `src/lib/sync-persist.ts` builds DB rows directly off Plaid field names, `src/lib/accounts.ts` consumes `AccountBase`, and `src/db/schema.ts:125` types a jsonb column with the vendor's `Transaction` type. `cards.plaidAccountNames` embeds a Plaid-specific matching key into the core card model. Swapping/adding an aggregator — or absorbing a breaking Plaid schema change — would require touching schema, sync, persistence, and matching simultaneously rather than one seam. Unlike the codebase's other deliberate couplings, no design record covers this; all three auditors recommend recording it as an explicit "accepted for now" decision rather than leaving it implicit.

# Moderate Concerns

- **Strictly sequential `syncAllItems` — scalability ceiling** (flagged by all 3 auditors) — `src/lib/sync-all.ts:25–37` awaits `syncItem` per item; each item can involve up to 200 Plaid pages and ~20s of `NOT_READY` sleeps. Unrelated items have no correctness reason to serialize (per-item `serializeByKey` already handles same-item races), so total sync time grows linearly with linked institutions. Not discussed in `scheduled-sync.md`, which covers locking but not cross-item throughput. (Also flagged in the performance-efficiency report.)
- **No user/tenant scoping in the data model** (1 auditor) — beyond the documented lack of route auth, `src/db/schema.ts` has no `user_id` column anywhere; item/account/transaction IDs are globally unique with no scoping key. Adapting to multiple users would be a schema migration touching every table's unique constraints and every query — a deeper structural commitment than the existing `single-user-localhost-no-auth.md` note captures; worth recording explicitly.
- **No key-rotation path for `ENCRYPTION_KEY`** (2 auditors, ranked moderate/minor) — `src/lib/crypto.ts` uses a single fixed key with no key ID/version in the `iv:tag:ciphertext` format; rotation invalidates every stored Plaid token, and the only remedy is removing and re-linking every institution. Acknowledged in `access-tokens-encrypted.md` as a consequence, but there is no incremental path (e.g. try-old-key-on-decrypt-failure), and the cost of hitting it grows with each linked item.

# Minor Concerns

- **Plaid Link language hardcoded** (1 auditor) — `src/lib/plaid.ts:115` hardcodes `language: 'en'` while sibling config (`PLAID_PRODUCTS`, `PLAID_COUNTRY_CODES`) is env-validated; a `PLAID_LANGUAGE` env var would be consistent.
- **Card matching is a single rigid strategy with no extension seam** (1 auditor) — exact case-insensitive name match only; as the catalog grows, name variants across institutions/locales have no seam beyond adding literal strings. (Cross-referenced in the compatibility report as a fragile Plaid contract.)
- **`cards.type` is a fixed two-value enum** (2 auditors) — `'cashback' | 'points'` (`src/db/schema.ts:25`); a new reward model (miles, hybrid) needs a migration plus the hand-maintained DB CHECK constraint noted in `category-kind-exhaustive.md`. Recorded design choice; residual note only.
- **Sync interval is a compile-time constant** (1 auditor) — `STARTUP_DELAY_MS`/`INTERVAL_MS` hardcoded in `src/lib/sync-scheduler.ts`; considered trade-off per `scheduled-sync.md`, but faster/slower sync per environment currently requires a code change.
- **`pg.Pool` has no configurable sizing** (1 auditor) — library defaults, nothing environment-driven; easy to add now, easy to forget later. (Overlaps reliability/compatibility findings on the pool.)
