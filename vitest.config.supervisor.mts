import { defineConfig } from 'vitest/config';

// Process-level supervisor tests (npm run test:supervisor) — they spawn real
// node processes and take seconds each, so they stay out of `npm test`.
export default defineConfig({
  test: {
    include: ['test/start-supervisor.test.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 25_000,
    hookTimeout: 25_000,
  },
});
