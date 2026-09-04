import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// .env.local first, then .env; dotenv never overrides, so .env.local wins.
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
