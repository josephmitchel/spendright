import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '@/db/schema';
import { PublicError } from '@/lib/errors';

// pg treats a missing connectionString as "use PG* env vars and libpq
// defaults", so an unset DATABASE_URL must fail here, not connect elsewhere.
// Design: config-validated-not-assumed. Runs at module load; never logs the value.
const DATABASE_URL_PATTERN = /^postgres(ql)?:\/\//;

function getConnectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url || !DATABASE_URL_PATTERN.test(url)) {
    throw new PublicError(
      'DATABASE_URL must be a postgresql:// connection URL — set it in .env.local',
      { status: 500, code: 'BAD_CONFIG' },
    );
  }
  return url;
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
