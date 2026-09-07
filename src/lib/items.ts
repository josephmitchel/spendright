import { getTableColumns } from 'drizzle-orm';
import { items, type ItemRow } from '@/db/schema';

// Every column except the encrypted access token; the served row type is
// derived from this runtime pick. Design: access-tokens-encrypted.
const { accessToken: _accessToken, ...publicItemColumns } = getTableColumns(items);
export { publicItemColumns };

export type PublicItemRow = Pick<ItemRow, keyof typeof publicItemColumns & keyof ItemRow>;
