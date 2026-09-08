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
