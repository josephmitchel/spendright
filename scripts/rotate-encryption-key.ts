// Re-encrypts every stored Plaid access token under the current ENCRYPTION_KEY.
// Rotation: move the old key to ENCRYPTION_KEY_PREVIOUS, set the new
// ENCRYPTION_KEY, run `npm run rotate:key`, then unset the previous key.
// Design: encryption-key-rotation.

// Must stay the first import so env is loaded before the modules below evaluate.
import './load-env';

import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { items } from '../src/db/schema';
import { decrypt, encrypt } from '../src/lib/crypto';
import { requireDatabaseUrl } from '../src/lib/env';
import { logFatalAndExit, logInfo } from '../src/lib/log';
import { createBoundedPool } from '../src/lib/pool-config';

async function main() {
  // Own pool, not src/lib/db's singleton (that module is server-only) — the
  // script must end() it so the process can exit. Design: shared-pool-config.
  const pool = createBoundedPool(requireDatabaseUrl());
  const rootDb = drizzle(pool);

  try {
    const rows = await rootDb
      .select({ itemId: items.itemId, accessToken: items.accessToken })
      .from(items);
    let rotated = 0;
    for (const row of rows) {
      // decrypt falls back to ENCRYPTION_KEY_PREVIOUS; encrypt always uses the
      // current key. The write only lands on the exact ciphertext read, so a
      // concurrent link/relink (which wrote under the current key) is never
      // overwritten with a re-encryption of its stale predecessor.
      const token = decrypt(row.accessToken);
      const updated = await rootDb
        .update(items)
        .set({ accessToken: encrypt(token) })
        .where(and(eq(items.itemId, row.itemId), eq(items.accessToken, row.accessToken)))
        .returning({ itemId: items.itemId });
      if (updated.length === 0) {
        logInfo(`  ${row.itemId}: token changed mid-rotation — kept the live server's write`);
      } else {
        rotated++;
      }
    }
    logInfo(
      `Re-encrypted ${rotated} of ${rows.length} access token(s) under the current ` +
        'ENCRYPTION_KEY — ENCRYPTION_KEY_PREVIOUS can be unset now. Interrupted or skipped ' +
        'rows keep decrypting via the fallback; rerunning is safe.',
    );
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  logFatalAndExit('rotation failed:', err);
});
