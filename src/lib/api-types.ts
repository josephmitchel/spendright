// The API response contract, derived from the schema's row types so a column
// change breaks client compilation instead of failing silently at runtime.
// Client components must read responses as these types (via readJson<T>) and
// never hand-declare their own row mirrors. Type-only imports — nothing here
// reaches a bundle. Design: typed-api-contract, single-response-reader.
import type {
  AccountRow,
  CardCategoryRow,
  CardRow,
  CreditCategoryRow,
  ItemRow,
  TransactionRow,
} from '@/db/schema';
import type { SyncItemResult } from '@/lib/sync';

// Over JSON, timestamp columns arrive as ISO strings (numeric columns are
// already strings in the row types).
type Serialized<T> = {
  [K in keyof T]: T[K] extends Date ? string : T[K] extends Date | null ? string | null : T[K];
};

export type ApiAccount = Serialized<AccountRow>;
// The encrypted access token is never served. Design: access-tokens-encrypted.
export type ApiItem = Omit<Serialized<ItemRow>, 'accessToken'>;
export type ApiCardCategory = Serialized<CardCategoryRow>;
export type ApiCard = Serialized<CardRow> & { categories: ApiCardCategory[] };
export type ApiCreditCategory = Serialized<CreditCategoryRow>;
// The raw Plaid payload is never served; the joined category names ride
// along. Design: raw-plaid-payload-stored-not-served.
export type ApiTransaction = Omit<Serialized<TransactionRow>, 'plaidTransaction'> & {
  cardCategoryName: string | null;
  creditCategoryName: string | null;
};

// GET /api/accounts
export interface AccountsResponse {
  accounts: ApiAccount[];
}

// GET /api/items
export interface ItemsResponse {
  items: ApiItem[];
}

// DELETE /api/items/[itemId]
export interface ItemDeleteResponse {
  deleted: string;
}

// GET /api/cards
export interface CardsResponse {
  cards: ApiCard[];
  creditCategories: ApiCreditCategory[];
}

// GET /api/transactions
export interface TransactionsResponse {
  transactions: ApiTransaction[];
  total: number;
  limit: number;
  offset: number;
}

// PATCH /api/transactions/[transactionId]
export interface TransactionPatchResponse {
  transaction: ApiTransaction;
}

// POST /api/link-token
export interface LinkTokenResponse {
  link_token: string;
}

// POST /api/sync
export interface SyncResponse {
  results: Array<SyncItemResult | { itemId: string; error: string }>;
}

// POST /api/exchange
export interface ExchangeResponse {
  item_id: string;
  institution_name: string | null;
  accounts: number;
  transactions: SyncItemResult | null;
  sync_error: string | null;
  account_errors: string[] | null;
}
