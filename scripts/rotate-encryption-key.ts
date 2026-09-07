// Re-encrypts every stored Plaid access token under the current ENCRYPTION_KEY.
// Rotation: move the old key to ENCRYPTION_KEY_PREVIOUS, set the new
// ENCRYPTION_KEY, run `npm run rotate:key`, then unset the previous key.
// Design: encryption-key-rotation.

// Must stay the first import so env is loaded before the modules below evaluate.
import './load-env';

import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { items } from '../src/db/schema';
import { decrypt, encrypt } from '../src/lib/crypto';
import { requireDatabaseUrl } from '../src/lib/env';
import { logError, logFatalAndExit, logInfo } from '../src/lib/log';

async function main() {
  // Own pool, not src/lib/db's singleton — the script must end() it so the
  // process can exit. Timeouts mirror src/lib/db's POOL_TIMEOUTS.
  const pool = new Pool({
    connectionString: requireDatabaseUrl(),
    connectionTimeoutMillis: 10_000,
    statement_timeout: 30_000,
    query_timeout: 35_000,
  });
  pool.on('error', (err) => logError('postgres pool: idle client error', err));
  const rootDb = drizzle(pool);

  try {
    const rows = await rootDb
      .select({ itemId: items.itemId, accessToken: items.accessToken })
      .from(items);
    for (const row of rows) {
      // decrypt falls back to ENCRYPTION_KEY_PREVIOUS; encrypt always uses the
      // current key.
      const token = decrypt(row.accessToken);
      await rootDb
        .update(items)
        .set({ accessToken: encrypt(token) })
        .where(eq(items.itemId, row.itemId));
    }
    logInfo(
      `Re-encrypted ${rows.length} access token(s) under the current ENCRYPTION_KEY — ` +
        'ENCRYPTION_KEY_PREVIOUS can be unset now.',
    );
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  logFatalAndExit('rotation failed:', err);
});
