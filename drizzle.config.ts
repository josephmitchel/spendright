import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// .env.local first, then .env; dotenv never overrides, so .env.local wins.
config({ path: '.env.local' });
config();

// pg treats a missing connectionString as "use libpq defaults", not an
// error, and parses a wrong-scheme URL scheme-agnostically rather than
// rejecting it — migrations must never run against whatever is on localhost.
// Same guard as src/lib/db.ts. Design: config-validated-not-assumed.
if (!process.env.DATABASE_URL || !/^postgres(ql)?:\/\//.test(process.env.DATABASE_URL)) {
  throw new Error(
    'DATABASE_URL must be a postgresql:// connection URL — set it in .env.local (or .env) before running drizzle-kit',
  );
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
