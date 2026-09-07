---
name: cross-process-sync-lock
description: Per-item sync mutual exclusion across Node processes via a session-scoped Postgres advisory lock held on a dedicated pool client for the whole critical section (Plaid I/O plus the DB transaction), with the item row re-read under the lock
tags:
  [
    withItemSyncLock,
    src/lib/sync-lock.ts,
    syncItem,
    src/lib/sync.ts,
    pg_advisory_lock,
    hashtextextended,
    lock_timeout,
    LOCK_TIMEOUT_MS,
    SYNC_LOCKED,
    pgErrorCode,
    src/lib/db.ts,
    statement_timeout,
    removeItemCompletely,
  ]
date: 2026-09-07
---

Confirmed 2026-09-07: the 2026-09-07 audit found every guarantee against concurrent syncs of one item lived in `globalThis`-scoped memory, which holds only while exactly one Node process runs — a second process on the same `DATABASE_URL` (realistically `next dev` and `npm start` at once; replicas or serverless later) silently reintroduced the cursor race [[scheduled-sync]] forbids. The user chose DB-backed locking over merely documenting a single-process constraint.

`syncItem` now takes an `itemId`, not an `ItemRow`, and wraps `runSyncItem` in `withItemSyncLock` (src/lib/sync-lock.ts): a dedicated `pool.connect()` client takes `pg_advisory_lock(hashtextextended('spendright:item-sync:' || itemId, 0))` — session-scoped because the critical section spans Plaid I/O outside any transaction, so `pg_advisory_xact_lock` cannot cover it; schema-free, so no migration ([[migrations-only]] untouched). The client is destroyed (`release(true)`) in `finally` rather than explicitly unlocked: closing the session releases the lock unconditionally (crash included) and the `SET lock_timeout` never leaks into a reused pool connection. The lock alone would only serialize the race, not fix it — the cursor and access token are re-read from the DB inside the lock, never taken from a caller's snapshot; the narrowed signature makes syncing from a stale row unrepresentable.

Contention blocks with a bounded wait (`lock_timeout` = 60s, user-confirmed over try-and-skip): in the intended single-process topology the advisory lock is never contended (`serializeByKey` already queued same-process callers), so a wait only ever means a second process, and a timeout surfaces as a `SYNC_LOCKED` `PublicError` recorded on `items.error` like any per-item failure ([[error-message-allow-list]]) — visible and retryable rather than silent. Acquisitions slower than 1s are logged. The in-process primitives (`serializeByKey`, `singleFlight`, the scheduler flag) are retained for queueing and join semantics only. Sync-all deliberately has no cross-process guard of its own (considered and rejected): with per-item locks plus fresh re-reads a duplicate pass in another process is safe, merely wasteful, and its lock waits advertise the misconfiguration.

Two additions from the 2026-09-07 audit. The lock session raises its own `statement_timeout` above the 60s wait, because the pool-wide 30s default added under [[requests-have-deadlines]] would otherwise cancel the advisory wait early. And item deletion (`removeItemCompletely`, [[item-delete-plaid-first]]) now takes this lock too, so a delete cannot race a running sync.

**Deployment constraint (documented 2026-09-07, previously implicit):** this design requires a direct, session-mode Postgres connection. A transaction-pooling proxy (PgBouncer transaction mode, and the pooled endpoints of common serverless-Postgres providers) multiplexes statements across backend connections mid-session, silently breaking the session-scoped `SET` and `pg_advisory_lock` semantics the mutual exclusion rests on — the lock would stop excluding without any error. If the deployment story ever moves off a local/direct Postgres, use the provider's direct (session) endpoint for this app, or revisit the locking design.
