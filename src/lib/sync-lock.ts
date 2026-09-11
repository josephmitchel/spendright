import 'server-only';

import type { QueryConfig } from 'pg';
import { lockPool } from '@/lib/db';
import { logWarn } from '@/lib/log';
import { pgErrorCode } from '@/lib/pg-errors';
import { PublicError } from '@/lib/public-error';

const LOCK_TIMEOUT_MS = 60_000;
const SLOW_ACQUIRE_WARN_MS = 1_000;

// SpendRight's advisory-lock namespace: the two-int lock form scopes item-sync
// locks to this class id so they can't collide with another app's locks on a
// shared database ('SPR1' in ASCII, which fits int4).
const LOCK_CLASS_ID = 0x53_50_52_31;

// The pool's connectionTimeoutMillis rejection carries no SQLSTATE, only this
// message (Verified-on: pg@8.23.0, thrown from its pg-pool dependency), so it
// needs its own classification to reach the same 503 as a lock timeout.
export function isPoolConnectTimeout(err: unknown): boolean {
  return err instanceof Error && err.message.includes('timeout exceeded when trying to connect');
}

const syncBusy = (message: string) =>
  new PublicError(message, { status: 503, code: 'SYNC_LOCKED' });

// The lock session lives for fn's whole run — including its Plaid round
// trips — so it comes from the dedicated lockPool, never the shared pool.
// options.lockTimeoutMs exists for tests that drive the timeout paths.
export async function withItemSyncLock<T>(
  itemId: string,
  fn: () => Promise<T>,
  options?: { lockTimeoutMs?: number },
): Promise<T> {
  const lockTimeoutMs = options?.lockTimeoutMs ?? LOCK_TIMEOUT_MS;
  let client;
  try {
    client = await lockPool.connect();
  } catch (err) {
    // Every lockPool slot is held (a sync-all run plus other lock takers).
    if (isPoolConnectTimeout(err)) {
      throw syncBusy('Syncing is busy — try again in a moment');
    }
    throw err;
  }
  try {
    const started = Date.now();
    try {
      // The pool-level statement_timeout would cancel the 60s advisory wait,
      // so this session gets a higher one; release(true) destroys the session.
      await client.query(`SET statement_timeout = ${lockTimeoutMs + 10_000}`);
      await client.query(`SET lock_timeout = ${lockTimeoutMs}`);
      // The pool's client-side query_timeout (35s) is a construction-time JS
      // timer that SET cannot raise, so it would kill this wait before the
      // server-side lock_timeout fires with a classifiable 55P03; the per-query
      // override keeps the server-side cancel first (Verified-on: pg@8.23.0 —
      // client.js reads config.query_timeout before the connection default,
      // untyped in @types/pg's QueryConfig).
      await client.query({
        text: 'SELECT pg_advisory_lock($1, hashtext($2))',
        values: [LOCK_CLASS_ID, `item-sync:${itemId}`],
        query_timeout: lockTimeoutMs + 15_000,
      } as QueryConfig & { query_timeout: number });
    } catch (err) {
      if (pgErrorCode(err) === '55P03') {
        throw syncBusy('Another process is syncing this item — try again in a moment');
      }
      throw err;
    }
    const waited = Date.now() - started;
    if (waited >= SLOW_ACQUIRE_WARN_MS) {
      logWarn(`sync ${itemId}: waited ${waited}ms for the cross-process sync lock`);
    }
    return await fn();
  } finally {
    // Destroying the session releases the advisory lock even if unlock would fail.
    client.release(true);
  }
}
