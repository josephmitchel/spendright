import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '@/db/schema';
import { PublicError } from '@/lib/errors';

// Validated rather than handed over blind, on the same principle as
// ENCRYPTION_KEY in src/lib/crypto.ts and PLAID_ENV in src/lib/plaid.ts
// (decided 2026-09-04). pg reads a missing connectionString as "use the PG*
// env vars and libpq defaults" — localhost, $USER, a database named after the
// user — rather than as an error, so an unset DATABASE_URL did not fail: it
// quietly pointed every query at whatever happened to be listening, and the
// first sign was a "relation does not exist" from the wrong database.
// scripts/seed-cards.ts already guards this for the seed's deletes; the app
// gets the same check for the same reason. The shape test is the URL scheme
// only — enough to catch an empty value, a bare hostname, or a variable
// pasted from the wrong project, without second-guessing the rest of the URL.
//
// This runs at module load, so the PublicError surfaces in the dev server's
// log and overlay rather than through errorResponse — the pool is built once,
// at module scope, and the message names the variable and its shape either
// way. Never the value: a connection URL carries a password.
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

// Keep a single pool across Next.js dev HMR reloads
const globalForDb = globalThis as unknown as {
  pool?: Pool;
  db?: NodePgDatabase<typeof schema>;
};

const pool = globalForDb.pool ?? new Pool({ connectionString: getConnectionString() });

export const db: NodePgDatabase<typeof schema> = globalForDb.db ?? drizzle(pool, { schema });

if (process.env.NODE_ENV !== 'production') {
  globalForDb.pool = pool;
  globalForDb.db = db;
}
