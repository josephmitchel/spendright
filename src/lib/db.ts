// Build-time poison: a client component that value-imports this module (or
// anything that imports it) fails the build instead of bundling the pool.
// Design: client-server-boundary-enforced.
import 'server-only';

import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '@/db/schema';
import { requireDatabaseUrl } from '@/lib/env';
import { globalSingleton } from '@/lib/global-singleton';
import { PublicError } from '@/lib/public-error';

// Rethrown as PublicError so the failure surfaces as BAD_CONFIG at module
// load. Design: config-validated-not-assumed.
function getConnectionString(): string {
  try {
    return requireDatabaseUrl();
  } catch (err) {
    throw new PublicError((err as Error).message, { status: 500, code: 'BAD_CONFIG' });
  }
}

// One pool per process: HMR reloads and chunk duplication mean every copy of
// this module must land on the same pool (see src/lib/global-singleton.ts).
const pool = globalSingleton('pool', () => new Pool({ connectionString: getConnectionString() }));

export const db: NodePgDatabase<typeof schema> = globalSingleton('db', () =>
  drizzle(pool, { schema }),
);

// The handle drizzle passes to a transaction callback, for any drizzle
// client (the seed script's schemaless one included).
type TransactionCallbackOf<Db> = Db extends {
  transaction: (fn: infer Callback, ...rest: never[]) => unknown;
}
  ? Callback
  : never;
export type DrizzleTransaction<Db> =
  TransactionCallbackOf<Db> extends (tx: infer Tx) => unknown ? Tx : never;

// The app db's own transaction handle, the one domain modules take.
export type DbTransaction = DrizzleTransaction<typeof db>;
