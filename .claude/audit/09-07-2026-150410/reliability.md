---
characteristic: "reliability"
---
# Summary

All three auditors converged on the same headline finding: the one place a transient fault is not contained is the Postgres connection pool, and it can take down the entire process. Beyond that, the existing reliability engineering (per-item sync isolation, bounded `NOT_READY` retry budgets, cursor-hold-and-drop recovery, single-flight/serialize-by-key guards, Plaid and fetch timeouts, fail-closed config validation, `token-stored-before-enrichment`) was verified as sound and matching the design records in `.claude/design/current/`. Auditors explicitly did not re-litigate recorded decisions (deferred tests, sync/cursor design, etc.).

# Major Concerns

- **No `error` listener on the pg `Pool` — an idle-connection error crashes the whole process** (flagged by all 3 auditors) — `src/lib/db.ts:19` creates `new Pool({ connectionString })` with no `.on('error', ...)` (`scripts/seed-cards.ts:207` has the same pattern). node-postgres re-emits idle-client faults (DB restart, dropped TCP connection, network blip) as an `error` event on the `Pool`; with no listener, Node's `EventEmitter` semantics turn it into an uncaught exception that kills the server — including the hourly sync scheduler — until manually restarted. This is exactly the "transient fault becomes total invisible outage" class the `requests-have-deadlines.md` design record closed for Plaid/fetch, but the DB side was missed. Fix is one line: attach a logging `error` handler after pool construction.

# Moderate Concerns

- **No timeouts on the Postgres pool — a stalled connection or query can hang forever** (flagged by all 3 auditors, ranked major/moderate) — no `connectionTimeoutMillis` (pg default: wait forever on acquisition), no `statement_timeout`/`query_timeout`, no `idleTimeoutMillis`, and nothing set via the connection string. A `db.transaction(...)` that stalls inside `syncItem` (`src/lib/sync.ts`) or on lock acquisition (`for('update')` in `sync-carry.ts`/`sync-outcome.ts`) would hang under the per-item `serializeByKey` lock indefinitely — the exact failure mode `requests-have-deadlines.md` audited "every network wait" to prevent, with the database omitted.
- **No handling of `ITEM_LOGIN_REQUIRED`/permanent Plaid item errors** (1 auditor) — `src/lib/plaid-errors.ts` and `recordSyncFailure` (`src/lib/sync-outcome.ts`) treat every Plaid failure identically. When a bank requires re-authentication, every hourly sync fails identically and indefinitely with generic error text; there is no permanent-vs-transient distinction and no path to Plaid Link's update mode — the only recovery is delete-and-relink. A card's data can silently stop updating for an unbounded period (recoverability gap).
- **No retry/backoff for generic transient Plaid failures mid-sync** (1 auditor) — `syncTransactions` (`src/lib/plaid.ts:184–235`) retries only the `NOT_READY` empty-cursor case; a plain network error or transient 5xx aborts the item's pass immediately, leaving up to an hour of errored/stale state until the next scheduled run. No data loss (cursor only advances on completion), but inconsistent with the surrounding transient-fault handling.

# Minor Concerns

- **No `error.tsx`/`global-error.tsx` route boundaries** (1 auditor) — no error boundaries exist under `src/app`; low exposure today since every page is a client component using `useLoadProtocol` (which surfaces failures with a Retry action), but any future server component or out-of-protocol render exception would hit Next's default non-recoverable error page.
- **Pool sizing/idle behavior left at library defaults with no recorded rationale** (1 auditor) — unlike every other deliberately-chosen constant in the codebase (all tagged with `Design:` references), the `Pool` gets no explicit `max`/`idleTimeoutMillis`; the one piece of infra config not given the "config-validated-not-assumed" treatment.
- **`linkItem`'s parallel Plaid calls lack partial-failure messaging** (1 auditor) — `src/lib/link.ts:135–138` runs `getItem`/`getAccounts` via `Promise.all` after the token is already durably stored; a rejection surfaces as a bare 500 even though the link actually half-succeeded and will self-heal on the next hourly sync. Worth a status message; low severity given the automatic recovery.
