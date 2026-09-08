// Shared by src/lib/db.ts (server-only, so the standalone scripts cannot
// import it) and the seed/rotation scripts — one definition instead of three
// hand-synced copies. Every wait on Postgres is bounded; query_timeout >
// statement_timeout so the server-side cancel wins and surfaces a clean pg
// error. max is explicit because the sync concurrency budget is sized against
// it (each in-flight item holds its lock session plus a transaction
// connection).
import { Pool, types } from 'pg';
import { logError } from '@/lib/log';

// pg's default parser turns date columns into local-timezone JS Dates, which
// drizzle's string-mode date() re-serializes through toISOString() — shifting
// the day on UTC-positive hosts. Pass the string through untouched.
// Verified-on: pg@8.23.0, drizzle-orm@0.45.2
types.setTypeParser(1082, (value) => value);

export const POOL_CONFIG = {
  max: 10,
  connectionTimeoutMillis: 10_000,
  statement_timeout: 30_000,
  query_timeout: 35_000,
} as const;

export function createBoundedPool(connectionString: string): Pool {
  const created = new Pool({ connectionString, ...POOL_CONFIG });
  created.on('error', (err) => logError('postgres pool: idle client error', err));
  return created;
}
