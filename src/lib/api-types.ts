// *Payload is what a handler serves, *Response what a client reads after
// JSON serialization. Design: typed-api-contract.
import type { CreditCategoryRow } from '@/db/schema';
import type { ServedAccountRow } from '@/lib/accounts';
import type { CardWithCategories } from '@/lib/card-catalog';
import type { PublicItemRow } from '@/lib/items';
import type { LinkResult } from '@/lib/link';
import type { ItemErrorBody } from '@/lib/plaid-errors';
import type { SyncAllResult } from '@/lib/sync-all';
import type { LastSyncStatus } from '@/lib/sync-status';
import type { CategorizedTransaction } from '@/lib/transactions';

type Serialized<T> = T extends Date
  ? string
  : T extends Array<infer Element>
    ? Array<Serialized<Element>>
    : T extends object
      ? { [K in keyof T]: Serialized<T[K]> }
      : T;

export type ApiAccount = Serialized<ServedAccountRow>;
export type ApiItem = Serialized<PublicItemRow>;
export type ApiCard = Serialized<CardWithCategories>;
export type ApiCreditCategory = Serialized<CreditCategoryRow>;
export type ApiTransaction = Serialized<CategorizedTransaction>;

// GET /api/accounts
export interface AccountsPayload {
  accounts: ServedAccountRow[];
}
export type AccountsResponse = Serialized<AccountsPayload>;

// GET /api/accounts/[accountId] — null account is a 200, not a 404.
// The owning item's error rides along so the detail page can warn about
// staleness. Design: account-fetched-by-id.
export interface AccountPayload {
  account: ServedAccountRow | null;
  itemError: ItemErrorBody | null;
}
export type AccountResponse = Serialized<AccountPayload>;

// GET /api/items
export interface ItemsPayload {
  items: PublicItemRow[];
  lastSync: LastSyncStatus | null;
}
export type ItemsResponse = Serialized<ItemsPayload>;

// DELETE /api/items/[itemId]
export interface ItemDeleteResponse {
  deleted: string;
}

// GET /api/cards
export interface CardsPayload {
  cards: CardWithCategories[];
  creditCategories: CreditCategoryRow[];
}
export type CardsResponse = Serialized<CardsPayload>;

// GET /api/transactions
export interface TransactionsPayload {
  transactions: CategorizedTransaction[];
  total: number;
}
export type TransactionsResponse = Serialized<TransactionsPayload>;

// PATCH /api/transactions/[transactionId]
export interface TransactionPatchPayload {
  transaction: CategorizedTransaction;
}
export type TransactionPatchResponse = Serialized<TransactionPatchPayload>;

// POST /api/link-token
export interface LinkTokenResponse {
  link_token: string;
}

// POST /api/sync
export interface SyncResponse {
  results: SyncAllResult;
}

// POST /api/exchange
export interface ExchangeResponse {
  item_id: LinkResult['itemId'];
  institution_name: LinkResult['institutionName'];
  accounts_stored: LinkResult['accountsStored'];
  sync: LinkResult['sync'];
  sync_error: LinkResult['syncError'];
  setup_failed: LinkResult['setupFailed'];
  account_errors: LinkResult['accountErrors'] | null;
}
