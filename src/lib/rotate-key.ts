import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { items } from '@/db/schema';
import { decrypt, encrypt } from '@/lib/crypto';

export interface RotationSummary {
  rotated: number;
  // Items whose ciphertext changed between read and write (a concurrent
  // link/relink) — left as the live server wrote them.
  skipped: string[];
  total: number;
}

// decrypt falls back to ENCRYPTION_KEY_PREVIOUS; encrypt always uses the
// current key. The write only lands on the exact ciphertext read, so a
// concurrent link/relink (which wrote under the current key) is never
// overwritten with a re-encryption of its stale predecessor. Interrupted or
// skipped rows keep decrypting via the fallback; rerunning is safe.
export async function rotateAccessTokens(database: NodePgDatabase): Promise<RotationSummary> {
  const rows = await database
    .select({ itemId: items.itemId, accessToken: items.accessToken })
    .from(items);
  const skipped: string[] = [];
  let rotated = 0;
  for (const row of rows) {
    const token = decrypt(row.accessToken);
    const updated = await database
      .update(items)
      .set({ accessToken: encrypt(token) })
      .where(and(eq(items.itemId, row.itemId), eq(items.accessToken, row.accessToken)))
      .returning({ itemId: items.itemId });
    if (updated.length === 0) skipped.push(row.itemId);
    else rotated++;
  }
  return { rotated, skipped, total: rows.length };
}
