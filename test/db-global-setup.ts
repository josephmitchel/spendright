import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { testDatabaseUrl } from './db-url';

// Runs once per test:db invocation: create the test database if it does not
// exist, then bring it to the current migration state.
export default async function setup(): Promise<void> {
  const url = new URL(testDatabaseUrl());
  const dbName = url.pathname.slice(1);

  const adminUrl = new URL(url.toString());
  adminUrl.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  try {
    await admin.connect();
  } catch (err) {
    throw new Error(
      `test:db could not reach Postgres at ${adminUrl.host} — is it running? (${String(err)})`,
    );
  }
  try {
    await admin.query(`CREATE DATABASE "${dbName}"`);
  } catch (err) {
    const duplicate = (err as { code?: string }).code === '42P04';
    if (!duplicate) throw err;
  } finally {
    await admin.end();
  }

  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  try {
    await migrate(drizzle(client), { migrationsFolder: 'drizzle' });
  } finally {
    await client.end();
  }
}
