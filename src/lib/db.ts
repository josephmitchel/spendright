import 'server-only';

import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '@/db/schema';
import { requireDatabaseUrl } from '@/lib/env';
import { globalSingleton } from '@/lib/global-singleton';
import { createBoundedPool } from '@/lib/pool-config';
import { PublicError } from '@/lib/public-error';

function getConnectionString(): string {
  try {
    return requireDatabaseUrl();
  } catch (err) {
    throw new PublicError((err as Error).message, { status: 500, code: 'BAD_CONFIG' });
  }
}

// Inside the factory so bundler module-copies can't stack duplicate listeners.
export const pool = globalSingleton('pool', () => createBoundedPool(getConnectionString()));

// Item-sync lock sessions are held across an item's Plaid round trips, so they
// draw from this small dedicated pool: Plaid latency must never pin
// connections the shared pool serves API routes from (src/lib/sync-lock.ts).
// Sized for SYNC_CONCURRENCY lock sessions plus one user-initiated
// removeItemCompletely — sync-all.ts asserts that budget at load.
export const LOCK_POOL_MAX = 4;
export const lockPool = globalSingleton('lockPool', () =>
  createBoundedPool(getConnectionString(), { max: LOCK_POOL_MAX }),
);

// The supported baseline; a too-old server must fail at startup, not on the
// first sync.
const MIN_POSTGRES_VERSION_NUM = 110_000;

// Connection-class failures that resolve on their own when Postgres is still
// booting (cold start after a reboot, a container coming up). Anything else —
// bad URL, auth failure, version/proxy assertions — is config and fails fast.
const TRANSIENT_CONNECT_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EAI_AGAIN',
  '57P03', // cannot_connect_now: the server is starting up
]);

export function isTransientConnectError(err: unknown): boolean {
  if (err == null || typeof err !== 'object') return false;
  const code = (err as { code?: unknown }).code;
  if (typeof code === 'string' && TRANSIENT_CONNECT_CODES.has(code)) return true;
  // The pool's connectionTimeoutMillis rejection carries no code, only this
  // message (Verified-on: pg@8.23.0, thrown from its pg-pool dependency).
  return err instanceof Error && err.message.includes('timeout exceeded when trying to connect');
}

// Bounded so a not-ready-yet database doesn't trip start.mjs's crash-loop
// guard into a permanent stop; kept under the supervisor's 60s warm-up
// deadline so the specific connection error is what gets reported.
export async function waitForPostgres(): Promise<void> {
  const deadline = Date.now() + 45_000;
  for (;;) {
    try {
      await pool.query('select 1');
      return;
    } catch (err) {
      if (!isTransientConnectError(err) || Date.now() >= deadline) throw err;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

export async function assertSupportedPostgres(): Promise<void> {
  const { rows } = await pool.query<{ server_version_num: string }>('show server_version_num');
  const version = Number(rows[0]?.server_version_num);
  if (!Number.isFinite(version) || version < MIN_POSTGRES_VERSION_NUM) {
    throw new Error(
      `DATABASE_URL points at PostgreSQL ${rows[0]?.server_version_num ?? '(unknown)'} — ` +
        'SpendRight needs PostgreSQL 11 or newer',
    );
  }
}

// Per-item sync locks rely on session-scoped advisory locks and session SETs;
// a transaction-pooling proxy silently breaks both, so it must fail at startup
// instead. Same backend pid across queries plus a persisting SET means the
// client holds one real session.
export async function assertSessionModeConnection(): Promise<void> {
  const client = await pool.connect();
  try {
    const first = await client.query<{ pid: number }>('select pg_backend_pid() as pid');
    await client.query("set application_name = 'spendright'");
    const second = await client.query<{ pid: number; name: string }>(
      "select pg_backend_pid() as pid, current_setting('application_name') as name",
    );
    if (first.rows[0]?.pid !== second.rows[0]?.pid || second.rows[0]?.name !== 'spendright') {
      throw new Error(
        'DATABASE_URL appears to go through a transaction-pooling proxy (session state ' +
          "did not persist across queries on one connection) — SpendRight's per-item sync " +
          "locks need a direct session-mode connection; use the database's direct or " +
          'session-mode port',
      );
    }
  } finally {
    client.release(true);
  }
}

export const db: NodePgDatabase<typeof schema> = globalSingleton('db', () =>
  drizzle(pool, { schema }),
);

type TransactionCallbackOf<Db> = Db extends {
  transaction: (fn: infer Callback, ...rest: never[]) => unknown;
}
  ? Callback
  : never;
export type DrizzleTransaction<Db> =
  TransactionCallbackOf<Db> extends (tx: infer Tx) => unknown ? Tx : never;

export type DbTransaction = DrizzleTransaction<typeof db>;
