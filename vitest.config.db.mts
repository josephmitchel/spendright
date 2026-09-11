import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Real-Postgres test suite (npm run test:db) — separate from the pure-unit
// config so plain `npm test` never needs a database.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'server-only': fileURLToPath(new URL('./test/server-only-stub.ts', import.meta.url)),
    },
  },
  test: {
    include: ['src/**/*.dbtest.ts'],
    environment: 'node',
    globalSetup: ['./test/db-global-setup.ts'],
    setupFiles: ['./test/db-setup.ts'],
    // The files share one database and truncate between tests.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
