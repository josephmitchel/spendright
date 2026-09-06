import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '@/db/schema';
import { requireDatabaseUrl } from '@/lib/env';
import { PublicError } from '@/lib/errors';

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

// Keep a single pool per process. The cache is unconditional, not dev-only:
// dev HMR reloads this module, and the bundler duplicates it across chunks
// in any mode (the same duplication sync-all.ts guards against), so every
// copy must land on the same pool.
const globalForDb = globalThis as unknown as {
  pool?: Pool;
  db?: NodePgDatabase<typeof schema>;
};

const pool = globalForDb.pool ?? new Pool({ connectionString: getConnectionString() });

export const db: NodePgDatabase<typeof schema> = globalForDb.db ?? drizzle(pool, { schema });

globalForDb.pool = pool;
globalForDb.db = db;
