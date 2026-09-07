---
characteristic: "compatibility"
---
# Summary

Four auditors assessed compatibility (ISO/IEC 25010:2023 §3.3, co-existence and interoperability). All four independently verified that the prior round's findings are genuinely fixed at HEAD (`unofficial_currency_code` end-to-end, the Windows `chmod` guard in `scripts/tighten-next.mjs`, magic-byte MIME sniffing in `src/lib/image-mime.ts`) or formally recorded as accepted boundaries (`cross-process-sync-lock.md`, `deployment-boundaries.md`, `node-version-pinned.md`, `transient-plaid-retry.md`). The Plaid adapter boundary, `Plaid-Version` pin with its `Verified-on` lint gate, env validation, and CSP allowances for Plaid Link were checked and found sound. Two moderate concerns remain: a co-existence race in the key-rotation script, and an undocumented PostgreSQL version floor.

# Major Concerns

None.

# Moderate Concerns

- **`npm run rotate:key` mutates `items.access_token` with no lock and no transaction, racing a live server** (1 auditor) — `scripts/rotate-encryption-key.ts` (~28-42) reads every row, decrypts, then issues separate per-row `UPDATE`s with no `withItemSyncLock`, no wrapping transaction, and no optimistic concurrency check. The live server writes `access_token` during `POST /api/exchange` (link/relink via `storeItemShell`/`storeItem`, `src/lib/link.ts:49-104`), also unguarded by the sync lock. A relink that lands between the script's read and write is silently overwritten with the re-encrypted stale token — a lost update that can revert an item to a Plaid token no longer valid. Neither `encryption-key-rotation.md` nor the code accounts for this; contrast `seed-cards.ts` (single transaction) and `removeItemCompletely` (takes the sync lock). Narrow window at single-operator scale, hence moderate.

- **No documented or checked minimum PostgreSQL version, despite version-sensitive SQL** (2 auditors) — `src/lib/sync-lock.ts:21` uses `hashtextextended(...)`, which requires PostgreSQL ≥ 11 (plus `jsonb`/`check` usage in `src/db/schema.ts`). Node, Plaid, and `pg` versions are all pinned or `Verified-on`-checked, but no Postgres floor appears in `README.md`, `.env.example`, `src/lib/env.ts` validation, or any design record. An older or unusual managed Postgres fails opaquely only when the first sync runs, not at startup/config validation.

# Minor Concerns

- **Plaid `RATE_LIMIT_EXCEEDED`/429 is not distinguished from other 4xx failures** (3 auditors) — `src/lib/plaid.ts` (`isTransientPlaidFailure`/`retryOnce`) treats 429 as a hard failure, retried only at the next hourly tick with no backoff. This is a self-acknowledged deferred gap (`transient-plaid-retry.md` explicitly defers backoff), so low priority, but interoperability with Plaid's rate-limit signaling remains absent in practice.

- **Legacy Plaid `category`/`category_id` fallback has no forward-compatibility guard** (3 auditors) — `src/lib/plaid.ts:197`: `personal_finance_category?.primary ?? txn.category?.[0] ?? null`. Storing the legacy field is deliberate (`plaid-category-reserved.md`), but Plaid has deprecated it; if it is removed while `personal_finance_category` is also absent, ingest silently degrades to `null` with nothing distinguishing "genuinely uncategorized" from "both source fields gone."

- **Runtime does not assert the session-mode connection the advisory lock requires** (1 auditor, informational) — the constraint is correctly documented in `cross-process-sync-lock.md`, but pointing `DATABASE_URL` at a transaction-pooling proxy silently stops providing cross-process mutual exclusion; nothing detects it at runtime. Documented boundary, no action implied at this stage.

Note: one auditor flagged the pinned `Plaid-Version` header as lacking a drift guard, but another verified that the `Verified-on: plaid@41.4.0` marker checked by `scripts/check-verified-claims.mjs` fails lint on any `plaid` bump, forcing re-verification of the pin. The residual risk is limited to re-verification being done carelessly, so this was not carried as a finding.
