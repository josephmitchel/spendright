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

// The supported baseline; a too-old server must fail at startup, not on the
// first sync.
const MIN_POSTGRES_VERSION_NUM = 110_000;

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
