// Points every stored item's Plaid webhook deliveries at PLAID_WEBHOOK_URL.
// New links get the URL from the link token; this one-off covers items linked
// before it was set (or after it changed). Run with: npm run webhooks:update
// Design: webhook-registration.

// Must stay the first import so env is loaded before the modules below evaluate.
import './load-env';

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { items } from '../src/db/schema';
import { decrypt } from '../src/lib/crypto';
import { loggableError } from '../src/lib/log';
import { getWebhookUrl, updateItemWebhook } from '../src/lib/plaid';

async function main() {
  const webhookUrl = getWebhookUrl();
  if (!webhookUrl) {
    throw new Error(
      'PLAID_WEBHOOK_URL is not set — set it in .env.local to the public URL reaching /api/webhook before registering webhooks',
    );
  }

  // pg treats a missing connectionString as "use libpq defaults", not an
  // error, and parses a wrong-scheme URL scheme-agnostically rather than
  // rejecting it. Same guard as src/lib/db.ts. Design: config-validated-not-assumed.
  if (!process.env.DATABASE_URL || !/^postgres(ql)?:\/\//.test(process.env.DATABASE_URL)) {
    throw new Error(
      'DATABASE_URL must be a postgresql:// connection URL — set it in .env.local (or .env) before registering webhooks',
    );
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const rootDb = drizzle(pool);

  try {
    const itemList = await rootDb.select().from(items);
    // Per-item failures are logged and skipped so one bad item (a revoked
    // token, say) doesn't stop the rest from being registered.
    let failures = 0;
    for (const item of itemList) {
      const label = item.institutionName ?? item.itemId;
      try {
        await updateItemWebhook(decrypt(item.accessToken), webhookUrl);
        console.log(`  ${label}: webhook set`);
      } catch (err) {
        failures++;
        console.error(`  ${label}: webhook update failed —`, loggableError(err));
      }
    }
    console.log(
      `${itemList.length - failures}/${itemList.length} item(s) now report to ${webhookUrl}.`,
    );
    if (failures > 0) process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(loggableError(err));
  process.exit(1);
});
