import { getTableColumns } from 'drizzle-orm';
import { items, type ItemRow } from '@/db/schema';

// Design: access-tokens-encrypted.
const { accessToken: _accessToken, ...publicItemColumns } = getTableColumns(items);
export { publicItemColumns };

export type PublicItemRow = Pick<ItemRow, keyof typeof publicItemColumns & keyof ItemRow>;
