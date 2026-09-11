import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const alias = {
  '@': fileURLToPath(new URL('./src', import.meta.url)),
  // The real package throws outside a react-server condition.
  'server-only': fileURLToPath(new URL('./test/server-only-stub.ts', import.meta.url)),
};

// One `npm test` run: pure logic in node, component/hook tests in jsdom.
export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'ui',
          include: ['src/**/*.test.tsx'],
          environment: 'jsdom',
          // Testing Library auto-registers its afterEach cleanup only when
          // the globals exist.
          globals: true,
        },
      },
    ],
  },
});
