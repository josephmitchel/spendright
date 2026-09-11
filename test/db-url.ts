import { config } from 'dotenv';

// TEST_DATABASE_URL wins; otherwise the dev DATABASE_URL with its database
// swapped for spendright_test. The _test suffix is a hard guard: these tests
// truncate every table, so they must never run against a real database.
export function testDatabaseUrl(): string {
  config({ path: '.env.local', quiet: true });
  config({ quiet: true });
  const explicit = process.env.TEST_DATABASE_URL;
  const url = new URL(
    explicit ?? process.env.DATABASE_URL ?? 'postgresql://localhost:5432/spendright',
  );
  if (!explicit) url.pathname = '/spendright_test';
  const dbName = url.pathname.slice(1);
  if (!/^[A-Za-z0-9_]+_test$/.test(dbName)) {
    throw new Error(
      `refusing to run db tests against "${dbName}" — the database name must end in _test ` +
        '(set TEST_DATABASE_URL to a dedicated test database)',
    );
  }
  return url.toString();
}
