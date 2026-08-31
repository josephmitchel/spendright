import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '@/db/schema';

// Keep a single pool across Next.js dev HMR reloads
const globalForDb = globalThis as unknown as {
  pool?: Pool;
  db?: NodePgDatabase<typeof schema>;
};

const pool =
  globalForDb.pool ??
  new Pool({ connectionString: process.env.DATABASE_URL });

export const db: NodePgDatabase<typeof schema> =
  globalForDb.db ?? drizzle(pool, { schema });

if (process.env.NODE_ENV !== 'production') {
  globalForDb.pool = pool;
  globalForDb.db = db;
}
