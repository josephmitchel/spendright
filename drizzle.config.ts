// Loads .env.local then .env (shared bootstrap; .env.local wins).
import './scripts/load-env';

import { defineConfig } from 'drizzle-kit';
import { requireDatabaseUrl } from './src/lib/env';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    // Shared guard — migrations must never run against whatever is on
    // localhost. Design: config-validated-not-assumed.
    url: requireDatabaseUrl(),
  },
});
