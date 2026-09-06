import {
  AccountBase,
  Configuration,
  CountryCode,
  ItemWithConsentFields,
  LinkTokenCreateRequest,
  PlaidApi,
  PlaidEnvironments,
  Products,
  RemovedTransaction,
  Transaction as PlaidTransaction,
} from 'plaid';
import { PublicError } from '@/lib/errors';

// Validated: an unknown PLAID_ENV indexes to undefined, which the SDK treats
// as "unset" and silently defaults to production. Design: config-validated-not-assumed
function getBasePath(): string {
  const env = process.env.PLAID_ENV || 'sandbox';
  const basePath = PlaidEnvironments[env];
  if (!basePath) {
    throw new PublicError(
      `PLAID_ENV is not a Plaid environment — use one of: ${Object.keys(PlaidEnvironments).join(
        ', ',
      )}`,
      { status: 500, code: 'BAD_CONFIG' },
    );
  }
  return basePath;
}

// Unset credentials would go to Plaid as blank headers and come back as
// Plaid's INVALID_API_KEYS, which names neither variable.
// Design: config-validated-not-assumed
function getCredential(name: 'PLAID_CLIENT_ID' | 'PLAID_SECRET'): string {
  const value = process.env[name];
  if (!value) {
    throw new PublicError(
      `${name} must be set — copy it from the Plaid dashboard into .env.local`,
      {
        status: 500,
        code: 'BAD_CONFIG',
      },
    );
  }
  return value;
}

// Built once per process: the configuration is immutable after validation,
// so per-call construction only re-allocates the SDK client. If validation
// throws, nothing is cached and the next call re-validates.
let cachedClient: PlaidApi | null = null;

function getClient(): PlaidApi {
  if (cachedClient) return cachedClient;
  const configuration = new Configuration({
    basePath: getBasePath(),
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': getCredential('PLAID_CLIENT_ID'),
        'PLAID-SECRET': getCredential('PLAID_SECRET'),
        'Plaid-Version': '2020-09-14',
      },
    },
  });
  cachedClient = new PlaidApi(configuration);
  return cachedClient;
}

// Comma-separated env list: entries trimmed, blanks dropped, and the fallback
// used when the result is empty as well as when the variable is unset.
function splitEnvList(raw: string | undefined, fallback: string): string[] {
  const parsed = (raw ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : [fallback];
}

// Validated against the SDK's enum values: a typo'd entry would otherwise
// sail through a cast and surface as a Plaid API error naming neither the
// variable nor the bad value. Design: config-validated-not-assumed.
function getEnvEnumList<T extends string>(
  name: 'PLAID_PRODUCTS' | 'PLAID_COUNTRY_CODES',
  fallback: T,
  allowedValues: T[],
): T[] {
  const entries = splitEnvList(process.env[name], fallback);
  const allowed = new Set<string>(allowedValues);
  const valid = entries.filter((entry): entry is T => allowed.has(entry));
  if (valid.length !== entries.length) {
    const invalid = entries.filter((entry) => !allowed.has(entry));
    throw new PublicError(
      `${name} contains ${invalid.join(', ')} — use one of: ${allowedValues.join(', ')}`,
      { status: 500, code: 'BAD_CONFIG' },
    );
  }
  return valid;
}

function getProducts(): Products[] {
  return getEnvEnumList('PLAID_PRODUCTS', Products.Transactions, Object.values(Products));
}

function getCountryCodes(): CountryCode[] {
  return getEnvEnumList('PLAID_COUNTRY_CODES', CountryCode.Us, Object.values(CountryCode));
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// Create Link Token
// https://plaid.com/docs/api/link/#create-link-token
export async function createLinkToken(): Promise<string> {
  const configs: LinkTokenCreateRequest = {
    user: { client_user_id: 'spendright-user' },
    client_name: 'SpendRight',
    products: getProducts(),
    country_codes: getCountryCodes(),
    language: 'en',
  };

  const response = await getClient().linkTokenCreate(configs);
  return response.data.link_token;
}

// Exchange a Link public_token for an access_token and item_id
// https://plaid.com/docs/api/items/#itempublic_tokenexchange
export async function exchangePublicToken(
  publicToken: string,
): Promise<{ accessToken: string; itemId: string }> {
  const response = await getClient().itemPublicTokenExchange({ public_token: publicToken });
  return {
    accessToken: response.data.access_token,
    itemId: response.data.item_id,
  };
}

// https://plaid.com/docs/api/items/#itemget
export async function getItem(accessToken: string): Promise<ItemWithConsentFields> {
  const response = await getClient().itemGet({ access_token: accessToken });
  return response.data.item;
}

// Institution metadata (logo, primary_color) by id
// https://plaid.com/docs/api/institutions/#institutionsget_by_id
export async function getInstitutionById(
  institutionId: string,
): Promise<{ logo: string | null; primaryColor: string | null; name: string }> {
  const response = await getClient().institutionsGetById({
    institution_id: institutionId,
    country_codes: getCountryCodes(),
    options: { include_optional_metadata: true },
  });
  const inst = response.data.institution;
  return {
    logo: inst.logo ?? null,
    primaryColor: inst.primary_color ?? null,
    name: inst.name,
  };
}

// https://plaid.com/docs/api/accounts/#accountsget
export async function getAccounts(accessToken: string): Promise<AccountBase[]> {
  const response = await getClient().accountsGet({ access_token: accessToken });
  return response.data.accounts;
}

// https://plaid.com/docs/api/items/#itemremove
export async function itemRemove(accessToken: string): Promise<string> {
  const response = await getClient().itemRemove({ access_token: accessToken });
  return response.data.request_id;
}

export interface SyncResult {
  added: PlaidTransaction[];
  modified: PlaidTransaction[];
  removed: RemovedTransaction[];
  cursor: string | null;
}

// Re-polls of transactions/sync while Plaid reports the item as not ready.
// Callers with a request timeout to respect pass a smaller budget.
// Design: not-ready-poll-budgets
const DEFAULT_NOT_READY_RETRIES = 10;
const NOT_READY_DELAY_MS = 2000;

export interface SyncOptions {
  notReadyRetries?: number;
}

// Fetch transaction changes for an item using the sync endpoint
// https://plaid.com/docs/api/products/transactions/#transactionssync
export async function syncTransactions(
  accessToken: string,
  initialCursor?: string | null,
  options?: SyncOptions,
): Promise<SyncResult> {
  const client = getClient();
  let cursor: string | null = initialCursor ?? null;
  let added: PlaidTransaction[] = [];
  let modified: PlaidTransaction[] = [];
  let removed: RemovedTransaction[] = [];
  let hasMore = true;
  let notReadyRetries = 0;
  // `?? DEFAULT`, so an explicit 0 means zero retries rather than falling back.
  const notReadyBudget = options?.notReadyRetries ?? DEFAULT_NOT_READY_RETRIES;

  // The has_more loop is not bounded; a large first sync is many round trips.
  while (hasMore) {
    const response = await client.transactionsSync({
      access_token: accessToken,
      cursor: cursor ?? undefined,
    });
    const data = response.data;

    // An empty next_cursor means Plaid hasn't finished preparing the
    // item's transactions yet — wait and retry without advancing.
    if (data.next_cursor === '') {
      if (notReadyRetries++ >= notReadyBudget) {
        // PublicError so the message reaches the user; 503 because it is transient.
        throw new PublicError(
          'Plaid is still preparing this account’s transactions — try syncing again in a minute',
          { status: 503, code: 'NOT_READY' },
        );
      }
      await sleep(NOT_READY_DELAY_MS);
      continue;
    }

    cursor = data.next_cursor;
    added = added.concat(data.added);
    modified = modified.concat(data.modified);
    removed = removed.concat(data.removed);
    hasMore = data.has_more;
  }

  return { added, modified, removed, cursor };
}
