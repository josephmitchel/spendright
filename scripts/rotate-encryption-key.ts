// Re-encrypts every stored Plaid access token under the current ENCRYPTION_KEY.
// Rotation: move the old key to ENCRYPTION_KEY_PREVIOUS, set the new
// ENCRYPTION_KEY, run `npm run rotate:key`, then unset the previous key.

// Must stay the first import so env is loaded before the modules below evaluate.
import './load-env';

import { drizzle } from 'drizzle-orm/node-postgres';
import { requireDatabaseUrl } from '../src/lib/env';
import { logFatalAndExit, logInfo } from '../src/lib/log';
import { createBoundedPool } from '../src/lib/pool-config';
import { rotateAccessTokens } from '../src/lib/rotate-key';

async function main() {
  // Own pool, not src/lib/db's singleton (that module is server-only) — the
  // script must end() it so the process can exit.
  const pool = createBoundedPool(requireDatabaseUrl());
  try {
    const { rotated, skipped, total } = await rotateAccessTokens(drizzle(pool));
    for (const itemId of skipped) {
      logInfo(`  ${itemId}: token changed mid-rotation — kept the live server's write`);
    }
    logInfo(
      `Re-encrypted ${rotated} of ${total} access token(s) under the current ` +
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
