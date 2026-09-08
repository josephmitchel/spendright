import { eq, getTableColumns, sql } from 'drizzle-orm';
import { items, type ItemRow } from '@/db/schema';
import { decrypt } from '@/lib/crypto';
import { db } from '@/lib/db';
import { logError } from '@/lib/log';
import { removeItem } from '@/lib/plaid';
import { plaidErrorBody } from '@/lib/plaid-errors';
import { PublicError } from '@/lib/public-error';
import { withItemSyncLock } from '@/lib/sync-lock';

// The logo blob would otherwise ride every 60s poll; lists carry a flag and
// GET /api/items/[itemId]/logo serves the bytes.
const {
  accessToken: _accessToken,
  institutionLogo: _institutionLogo,
  ...listedItemColumns
} = getTableColumns(items);
export const publicItemColumns = {
  ...listedItemColumns,
  hasLogo: sql<boolean>`(${items.institutionLogo} is not null)`,
};

export type PublicItemRow = Pick<ItemRow, keyof typeof listedItemColumns & keyof ItemRow> & {
  hasLogo: boolean;
};

// The sync lock keeps the delete from yanking rows out from under a running
// sync. False means the item does not exist.
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
