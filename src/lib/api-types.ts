// The API contract. Each route's payload — the object its handler actually
// constructs, declared here as *Payload — is the single declaration: the
// handler annotates NextResponse.json<SomePayload>(...) and the client reads
// the body as readJson<SomeResponse>(...), where the response type is the
// payload after JSON serialization. A drift on either side breaks compilation
// instead of failing silently at runtime; the types are asserted at the
// boundary, not runtime-validated: the server is this same app. Client
// components must never hand-declare their own row mirrors. Type-only
// imports — nothing here reaches a bundle.
// Design: typed-api-contract, single-response-reader.
import type { AccountRow, CreditCategoryRow } from '@/db/schema';
import type { CardWithCategories } from '@/lib/card-catalog';
import type { CategorizedTransaction } from '@/lib/categories';
import type { PublicItemRow } from '@/lib/items';
import type { LinkResult } from '@/lib/link';
import type { SyncAllResult } from '@/lib/sync-all';

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

// The encrypted access token is never served; the type is derived from the
// runtime column pick in src/lib/items.ts, never a separate Omit that could
// drift from it. Design: access-tokens-encrypted.
type PublicItem = PublicItemRow;

export type ApiAccount = Serialized<AccountRow>;
export type ApiItem = Serialized<PublicItem>;
export type ApiCard = Serialized<CardWithCategories>;
export type ApiCreditCategory = Serialized<CreditCategoryRow>;
// The raw Plaid payload is never served; the joined category names ride
// along. Both facts live on CategorizedTransaction, the row type both
// transaction routes produce. Design: raw-plaid-payload-stored-not-served.
export type ApiTransaction = Serialized<CategorizedTransaction>;

// GET /api/accounts
export interface AccountsPayload {
  accounts: AccountRow[];
}
export type AccountsResponse = Serialized<AccountsPayload>;

// GET /api/items
export interface ItemsPayload {
  items: PublicItem[];
}
export type ItemsResponse = Serialized<ItemsPayload>;

// DELETE /api/items/[itemId] — no timestamp columns, so one type is both
// payload and response.
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
  limit: number;
  offset: number;
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

// POST /api/sync — the route returns the runner's result as-is (no timestamp
// columns), so the domain type is the contract.
export interface SyncResponse {
  results: SyncAllResult;
}

// POST /api/exchange. The wire keys are snake_case; each field's type is
// LinkResult's own, so renaming a LinkResult field breaks this declaration
// (and, through it, the route's annotated mapping) instead of silently
// serving undefined. No timestamp columns, so this is payload and response.
export interface ExchangeResponse {
  item_id: LinkResult['itemId'];
  institution_name: LinkResult['institutionName'];
  accounts: LinkResult['accountsStored'];
  transactions: LinkResult['sync'];
  sync_error: LinkResult['syncError'];
  // Empty is served as null.
  account_errors: LinkResult['accountErrors'] | null;
}
