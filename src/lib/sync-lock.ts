import 'server-only';

import type { QueryConfig } from 'pg';
import { pool } from '@/lib/db';
import { logWarn } from '@/lib/log';
import { pgErrorCode } from '@/lib/pg-errors';
import { PublicError } from '@/lib/public-error';

const LOCK_TIMEOUT_MS = 60_000;
const SLOW_ACQUIRE_WARN_MS = 1_000;

// SpendRight's advisory-lock namespace: the two-int lock form scopes item-sync
// locks to this class id so they can't collide with another app's locks on a
// shared database ('SPR1' in ASCII, which fits int4).
const LOCK_CLASS_ID = 0x53_50_52_31;

export async function withItemSyncLock<T>(itemId: string, fn: () => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    const started = Date.now();
    try {
      // The pool-level statement_timeout would cancel the 60s advisory wait,
      // so this session gets a higher one; release(true) destroys the session.
      await client.query(`SET statement_timeout = ${LOCK_TIMEOUT_MS + 10_000}`);
      await client.query(`SET lock_timeout = ${LOCK_TIMEOUT_MS}`);
      // The pool's client-side query_timeout (35s) is a construction-time JS
      // timer that SET cannot raise, so it would kill this wait before the
      // server-side lock_timeout fires with a classifiable 55P03; the per-query
      // override keeps the server-side cancel first (Verified-on: pg@8.23.0 —
      // client.js reads config.query_timeout before the connection default,
      // untyped in @types/pg's QueryConfig).
      await client.query({
        text: 'SELECT pg_advisory_lock($1, hashtext($2))',
        values: [LOCK_CLASS_ID, `item-sync:${itemId}`],
        query_timeout: LOCK_TIMEOUT_MS + 15_000,
      } as QueryConfig & { query_timeout: number });
    } catch (err) {
      if (pgErrorCode(err) === '55P03') {
        throw new PublicError('Another process is syncing this item — try again in a moment', {
          status: 503,
          code: 'SYNC_LOCKED',
        });
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
