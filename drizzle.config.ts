import './scripts/load-env';

import { defineConfig } from 'drizzle-kit';
import { requireDatabaseUrl } from './src/lib/env';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: requireDatabaseUrl(),
  },
});
