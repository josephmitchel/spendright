import { testDatabaseUrl } from './db-url';

// Runs in each worker before test files import anything: src/lib/db.ts builds
// its pool from DATABASE_URL at module load, so the override must land first.
process.env.DATABASE_URL = testDatabaseUrl();
process.env.ENCRYPTION_KEY ??= 'a'.repeat(64);
