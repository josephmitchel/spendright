import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// .env.local first, then .env. dotenv never overrides a variable that is
// already set, so whichever file loads FIRST wins — and the old order had it
// backwards: `import 'dotenv/config'` (which reads .env) sat above
// `config({ path: '.env.local' })`, and imports hoist above statements
// regardless, so a DATABASE_URL in .env would silently beat the one in
// .env.local and point db:migrate at the wrong database. That is the kind of
// mistake you only notice after it has already written to the wrong place.
// This order matches Next.js, which gives .env.local precedence, and
// scripts/load-env.ts, which loads the same two files in the same order.
config({ path: '.env.local' });
config();

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
