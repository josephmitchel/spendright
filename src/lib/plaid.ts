import 'server-only';

import {
  type AccountBase,
  Configuration,
  CountryCode,
  type ItemWithConsentFields,
  type LinkTokenCreateRequest,
  PlaidApi,
  PlaidEnvironments,
  Products,
  type RemovedTransaction,
  type Transaction as PlaidTransaction,
} from 'plaid';
import { globalSingleton } from '@/lib/global-singleton';
import { PublicError } from '@/lib/public-error';

// An unknown PLAID_ENV indexes to undefined and the SDK silently defaults to
// production. Design: config-validated-not-assumed.
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

// Axios's default timeout is 0 — wait forever (Verified-on: axios@1.20.0).
// Design: requests-have-deadlines.
const PLAID_TIMEOUT_MS = 60_000;

function getClient(): PlaidApi {
  return globalSingleton(
    'plaidClient',
    () =>
      new PlaidApi(
        new Configuration({
          basePath: getBasePath(),
          baseOptions: {
            timeout: PLAID_TIMEOUT_MS,
            headers: {
              'PLAID-CLIENT-ID': getCredential('PLAID_CLIENT_ID'),
              'PLAID-SECRET': getCredential('PLAID_SECRET'),
              'Plaid-Version': '2020-09-14',
            },
          },
        }),
      ),
  );
}

function splitEnvList(raw: string | undefined, fallback: string): string[] {
  const parsed = (raw ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : [fallback];
}

// Design: config-validated-not-assumed.
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

export async function exchangePublicToken(
  publicToken: string,
): Promise<{ accessToken: string; itemId: string }> {
  const response = await getClient().itemPublicTokenExchange({ public_token: publicToken });
  return {
    accessToken: response.data.access_token,
    itemId: response.data.item_id,
  };
}

export async function getItem(accessToken: string): Promise<ItemWithConsentFields> {
  const response = await getClient().itemGet({ access_token: accessToken });
  return response.data.item;
}

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

export async function getAccounts(accessToken: string): Promise<AccountBase[]> {
  const response = await getClient().accountsGet({ access_token: accessToken });
  return response.data.accounts;
}

export async function removeItem(accessToken: string): Promise<string> {
  const response = await getClient().itemRemove({ access_token: accessToken });
  return response.data.request_id;
}

export interface PlaidSyncBatch {
  added: PlaidTransaction[];
  modified: PlaidTransaction[];
  removed: RemovedTransaction[];
  cursor: string | null;
}

// Cumulative across a whole drain, not per stall. Design: not-ready-poll-budgets.
const DEFAULT_NOT_READY_RETRIES = 10;
const NOT_READY_DELAY_MS = 2000;

// Plaid's documented maximum page size.
const SYNC_PAGE_SIZE = 500;

// Design: requests-have-deadlines.
const MAX_SYNC_PAGES = 200;

export interface SyncOptions {
  notReadyRetries?: number;
}

export async function syncTransactions(
  accessToken: string,
  initialCursor?: string | null,
  options?: SyncOptions,
): Promise<PlaidSyncBatch> {
  const client = getClient();
  let cursor: string | null = initialCursor ?? null;
  let added: PlaidTransaction[] = [];
  let modified: PlaidTransaction[] = [];
  let removed: RemovedTransaction[] = [];
  let hasMore = true;
  let notReadyRetries = 0;
  const notReadyBudget = options?.notReadyRetries ?? DEFAULT_NOT_READY_RETRIES;

  let pages = 0;
  while (hasMore) {
    if (++pages > MAX_SYNC_PAGES) {
      throw new PublicError(
        `Plaid kept reporting more transactions after ${MAX_SYNC_PAGES} pulls — stopping this ` +
          'sync; try again later',
        { status: 502, code: 'SYNC_PAGE_BUDGET' },
      );
    }
    const response = await client.transactionsSync({
      access_token: accessToken,
      cursor: cursor ?? undefined,
      count: SYNC_PAGE_SIZE,
    });
    const data = response.data;

    // An empty next_cursor means Plaid hasn't finished preparing the item's
    // transactions yet.
    if (data.next_cursor === '') {
      if (notReadyRetries++ >= notReadyBudget) {
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
