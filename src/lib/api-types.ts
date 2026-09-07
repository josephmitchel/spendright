// The API contract. Handlers annotate NextResponse.json<SomePayload>(...);
// clients read getJson/sendJson<SomeResponse>(...) — the payload after JSON
// serialization. (A payload with no Date columns serializes to itself, so it
// is declared once, named *Response, and used on both sides.) Asserted at
// the boundary, not runtime-validated: the server is this same app.
// Type-only imports — nothing here reaches a bundle.
// Design: typed-api-contract, single-response-reader.
import type { CreditCategoryRow } from '@/db/schema';
import type { ServedAccountRow } from '@/lib/accounts';
import type { CardWithCategories } from '@/lib/card-catalog';
import type { PublicItemRow } from '@/lib/items';
import type { LinkResult } from '@/lib/link';
import type { SyncAllResult } from '@/lib/sync-all';
import type { CategorizedTransaction } from '@/lib/transactions';

// Over JSON, timestamp columns arrive as ISO strings (numeric columns are
// already strings in the row types). Recursive, so rows nested inside a
// payload are mapped too.
type Serialized<T> = T extends Date
  ? string
  : T extends Array<infer Element>
    ? Array<Serialized<Element>>
    : T extends object
      ? { [K in keyof T]: Serialized<T[K]> }
      : T;

// Derived from the runtime pick in src/lib/accounts.ts like the other served
// rows (nothing excluded today). Design: typed-api-contract.
export type ApiAccount = Serialized<ServedAccountRow>;
// The encrypted access token is never served (the pick lives in
// src/lib/items.ts). Design: access-tokens-encrypted.
export type ApiItem = Serialized<PublicItemRow>;
export type ApiCard = Serialized<CardWithCategories>;
export type ApiCreditCategory = Serialized<CreditCategoryRow>;
// The raw Plaid payload is never served; the joined category names ride
// along. Design: raw-plaid-payload-stored-not-served.
export type ApiTransaction = Serialized<CategorizedTransaction>;

// GET /api/accounts
export interface AccountsPayload {
  accounts: ServedAccountRow[];
}
export type AccountsResponse = Serialized<AccountsPayload>;

// GET /api/accounts/[accountId] — `account` is null when the id matches no
// row (a 200, not a 404). Design: account-fetched-by-id.
export interface AccountPayload {
  account: ServedAccountRow | null;
}
export type AccountResponse = Serialized<AccountPayload>;

// GET /api/items
export interface ItemsPayload {
  items: PublicItemRow[];
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

// GET /api/transactions — rows plus the account's total; the clamped bounds
// are not echoed.
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

// POST /api/exchange — snake_case wire keys, each field's type indexed off
// LinkResult so a rename on either side breaks compilation.
export interface ExchangeResponse {
  item_id: LinkResult['itemId'];
  institution_name: LinkResult['institutionName'];
  accounts_stored: LinkResult['accountsStored'];
  sync: LinkResult['sync'];
  sync_error: LinkResult['syncError'];
  // Empty is served as null.
  account_errors: LinkResult['accountErrors'] | null;
}
