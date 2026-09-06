import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '@/db/schema';
import { requireDatabaseUrl } from '@/lib/env';
import { PublicError } from '@/lib/public-error';
import { globalSingleton } from '@/lib/global-singleton';

// The shared guard from src/lib/env.ts, rethrown as PublicError so the
// failure reaches the user with BAD_CONFIG. Runs at module load, so it
// surfaces in the dev server log and overlay rather than through
// errorResponse. Design: config-validated-not-assumed.
function getConnectionString(): string {
  try {
    return requireDatabaseUrl();
  } catch (err) {
    throw new PublicError((err as Error).message, { status: 500, code: 'BAD_CONFIG' });
  }
}

// One pool per process — unconditional, not dev-only: dev HMR reloads this
// module, and the bundler duplicates it across chunks in any mode, so every
// copy must land on the same pool (see src/lib/global-singleton.ts).
const pool = globalSingleton('pool', () => new Pool({ connectionString: getConnectionString() }));

export const db: NodePgDatabase<typeof schema> = globalSingleton('db', () =>
  drizzle(pool, { schema }),
);

// The handle drizzle passes to a transaction callback, derived once here for
// any drizzle client (the seed script's schemaless one included) instead of
// each consumer re-spelling the Parameters<Parameters<...>> gymnastics.
type TransactionCallbackOf<Db> = Db extends {
  transaction: (fn: infer Callback, ...rest: never[]) => unknown;
}
  ? Callback
  : never;
export type DrizzleTransaction<Db> =
  TransactionCallbackOf<Db> extends (tx: infer Tx) => unknown ? Tx : never;

// The app db's own transaction handle, the one domain modules take.
export type DbTransaction = DrizzleTransaction<typeof db>;
