import 'server-only';

import { pool } from '@/lib/db';
import { logWarn } from '@/lib/log';
import { pgErrorCode } from '@/lib/pg-errors';
import { PublicError } from '@/lib/public-error';

// Design: cross-process-sync-lock.
const LOCK_TIMEOUT_MS = 60_000;
const SLOW_ACQUIRE_WARN_MS = 1_000;

export async function withItemSyncLock<T>(itemId: string, fn: () => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    const started = Date.now();
    try {
      await client.query(`SET lock_timeout = ${LOCK_TIMEOUT_MS}`);
      await client.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [
        `spendright:item-sync:${itemId}`,
      ]);
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
