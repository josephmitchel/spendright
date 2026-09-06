import { getTableColumns } from 'drizzle-orm';
import { items, type ItemRow } from '@/db/schema';

// Every column except the encrypted access token — the single definition of
// which item columns are served. The exclusion is made once, here, in the
// runtime pick; the served row type is derived from that pick below, so a
// column excluded at runtime can never be re-added at the type level alone
// (or vice versa). Design: access-tokens-encrypted.
const { accessToken: _accessToken, ...publicItemColumns } = getTableColumns(items);
export { publicItemColumns };

export type PublicItemRow = Pick<ItemRow, keyof typeof publicItemColumns & keyof ItemRow>;
