import 'server-only';

import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '@/db/schema';
import { requireDatabaseUrl } from '@/lib/env';
import { globalSingleton } from '@/lib/global-singleton';
import { logError } from '@/lib/log';
import { PublicError } from '@/lib/public-error';

// Design: config-validated-not-assumed.
function getConnectionString(): string {
  try {
    return requireDatabaseUrl();
  } catch (err) {
    throw new PublicError((err as Error).message, { status: 500, code: 'BAD_CONFIG' });
  }
}

// Every wait on Postgres is bounded; query_timeout > statement_timeout so the
// server-side cancel wins and surfaces a clean pg error.
// Design: requests-have-deadlines, db-pool-errors-logged.
export const POOL_TIMEOUTS = {
  connectionTimeoutMillis: 10_000,
  statement_timeout: 30_000,
  query_timeout: 35_000,
} as const;

// Inside the factory so bundler module-copies can't stack duplicate listeners.
export const pool = globalSingleton('pool', () => {
  const created = new Pool({ connectionString: getConnectionString(), ...POOL_TIMEOUTS });
  created.on('error', (err) => logError('postgres pool: idle client error', err));
  return created;
});

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
