import { eq, getTableColumns } from 'drizzle-orm';
import { items, type ItemRow } from '@/db/schema';
import { decrypt } from '@/lib/crypto';
import { db } from '@/lib/db';
import { logError } from '@/lib/log';
import { removeItem } from '@/lib/plaid';
import { plaidErrorBody } from '@/lib/plaid-errors';
import { PublicError } from '@/lib/public-error';
import { withItemSyncLock } from '@/lib/sync-lock';

// Design: access-tokens-encrypted.
const { accessToken: _accessToken, ...publicItemColumns } = getTableColumns(items);
export { publicItemColumns };

export type PublicItemRow = Pick<ItemRow, keyof typeof publicItemColumns & keyof ItemRow>;

// The sync lock keeps the delete from yanking rows out from under a running
// sync. False means the item does not exist.
// Design: item-delete-plaid-first, thin-routes-domain-in-lib, cross-process-sync-lock.
export function removeItemCompletely(itemId: string): Promise<boolean> {
  return withItemSyncLock(itemId, async () => {
    const [item] = await db.select().from(items).where(eq(items.itemId, itemId));
    if (!item) return false;

    let accessToken: string | null = null;
    try {
      accessToken = decrypt(item.accessToken);
    } catch (err) {
      if (!(err instanceof PublicError)) throw err;
      logError('item delete: token unreadable, skipping Plaid revoke:', err);
    }

    if (accessToken !== null) {
      try {
        await removeItem(accessToken);
      } catch (err) {
        if (plaidErrorBody(err)?.error_code !== 'ITEM_NOT_FOUND') throw err;
      }
    }

    await db.delete(items).where(eq(items.itemId, itemId));
    return true;
  });
}
