---
characteristic: "flexibility"
---
# Summary

Five auditors reviewed adaptability, scalability, installability, and replaceability. All were careful to exclude the trade-offs already confirmed and recorded in `.claude/design/current/` — the single-card catalog, the code-only card catalog, the in-process hourly scheduler, the localhost/no-auth posture, and the residual Plaid coupling accepted in `plaid-types-adapted-at-ingest.md`. Several noted that the prior audit round's major finding (Plaid SDK types used directly as the domain model) has been genuinely fixed via the `Provider*` adapter layer.

What remains splits into two genuine structural gaps not yet acknowledged in the design record — the single-process scaling ceiling and the absence of any user/tenant scoping in the schema — plus a cluster of smaller consistency gaps (hardcoded Link language, the closed reward-type enum, no key-rotation path).

# Major Concerns

- **In-process, single-instance locking is a structural scaling ceiling with no design record acknowledging it** (flagged by 1 of 5 as Major; corroborated at lower severity by 2 more) — `src/lib/global-singleton.ts:3-11` and `src/lib/async-coordination.ts` (`serializeByKey`, `singleFlight`), used by `src/lib/sync-all.ts:13-19` and `src/lib/sync.ts:36-40`. Every correctness guarantee against concurrent syncs of the same item (cursor-write races, duplicate sync-all runs) lives in `globalThis`-scoped memory, which holds only while exactly one Node process runs. A second process — container replicas, serverless invocations, or simply `next dev` and `npm start` pointed at the same `DATABASE_URL` (independently confirmed by a Compatibility auditor) — silently reintroduces the exact race `scheduled-sync.md` describes as closed "by construction." The design record reasons carefully about bundler module duplication but never about true multi-process execution; the primitives would need replacing (advisory locks or similar), not configuring.

# Moderate Concerns

- **No user/tenant scoping anywhere in the data model** — `src/db/schema.ts` has no `user_id` column on any table. `single-user-localhost-no-auth.md` documents the missing route auth as revisit-later, but says nothing about this deeper schema commitment: multi-user support is not "add auth" but a migration touching every table's unique constraints and every query in `src/lib/*`. Worth recording explicitly alongside the auth decision, since the actual adaptation cost is materially larger than that record implies.

- **The reward-type model is a closed two-value enum duplicated across three sites** (flagged by 3 of 5) — `src/db/schema.ts:25` (`'cashback' | 'points'`), `src/db/cards.seed.ts:4-8`, and the UI branch at `TransactionTable.tsx:92`, with no single source of truth or exhaustiveness tie between them (contrast `assertNeverKind` for `CategoryKind`). Adding a likely near-term type (miles, tiered/hybrid structures) requires a migration plus lockstep edits in three files. The two-value assumption is now load-bearing in rendering logic, not just storage.

- **No key-rotation/versioning path for `ENCRYPTION_KEY`** (flagged by 2 of 5; also raised under Security) — `src/lib/crypto.ts:10-55`; no key ID in the ciphertext format and no incremental path (e.g. trying a previous key on decrypt failure). `access-tokens-encrypted.md` names the consequence but the all-or-nothing re-link cost grows with every linked institution.

- **Card catalog adaptation requires a code change + reseed, on top of brittle exact-name matching** — `src/db/cards.seed.ts`, `src/lib/cards.ts:3-18`; an issuer-side rename silently lands the account in "unsupported" until a developer patches the seed. Both halves are design-confirmed (`card-catalog-in-code.md`, `account-card-matching-by-name.md`) — surfaced as a residual adaptation cost, not an oversight.

- **Strictly sequential `syncAllItems`** — `src/lib/sync-all.ts:25-37`; unrelated items have no correctness reason to serialize (the per-item lock already isolates same-item races), so sync wall-time grows linearly with institutions. Primary write-up under Performance Efficiency; noted here because `scheduled-sync.md` covers same-item locking but not cross-item throughput.

# Minor Concerns

- **Plaid Link language hardcoded** (flagged by 5 of 5 — the most-repeated finding in this characteristic) — `src/lib/plaid.ts:121` fixes `language: 'en'` while sibling parameters in the same request (`products`, `country_codes`) are env-validated via `getEnvEnumList`. A `PLAID_LANGUAGE` env var validated the same way restores consistency with the file's own `config-validated-not-assumed` pattern. No design note covers locale.
- **Sync/poll cadences are fixed constants** — `src/lib/sync-scheduler.ts:9-10` (1h interval, startup delay) and `src/hooks/useVisiblePoll.ts:6` (60s) have no env override, unlike the Plaid config surface.
- **`pg.Pool` sizing is not environment-driven** — `src/lib/db.ts:22-26`; easy to add now, likely to be forced later.
- **The linking flow has no provider-neutral seam** — `PlaidLinkButton.tsx`, `src/lib/api-paths.ts:6,9`; `provider-types.ts` adapts data shapes but the connect UI and API surface are Plaid-shaped end to end. Low severity — aggregators require their own widgets, so full decoupling has real costs; awareness only.
- **`scripts/tighten-next.mjs:14`** shells out to Unix `chmod` unconditionally with no `process.platform` check — a portability constraint handed over from the Compatibility audit.
