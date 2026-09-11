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
  type Transaction as PlaidTransaction,
} from 'plaid';
import { globalSingleton } from '@/lib/global-singleton';
import type {
  ProviderAccount,
  ProviderItem,
  ProviderRemovedTransaction,
  ProviderSyncBatch,
  ProviderTransaction,
} from '@/lib/provider-types';
import { PublicError } from '@/lib/public-error';

// An unknown PLAID_ENV indexes to undefined and the SDK silently defaults to
// production.
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
              // This pin matches the installed SDK's base version (Verified-on: plaid@41.4.0).
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

// The SDK types language as a plain string (no enum to validate against);
// Plaid rejects unsupported codes at link-token creation with its own error.
function getLanguage(): string {
  return process.env.PLAID_LANGUAGE?.trim() || 'en';
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// A missing response or a 5xx is transport-level, and a 429 is Plaid's own
// throttling signal asking to be retried; any other 4xx is Plaid's real answer.
const TRANSIENT_RETRY_DELAY_MS = 1000;
const MAX_RETRY_AFTER_MS = 30_000;

interface PlaidFailureShape {
  isAxiosError?: boolean;
  response?: { status?: number; headers?: Record<string, unknown> };
}

export function isTransientPlaidFailure(err: unknown): boolean {
  const maybe = err as PlaidFailureShape;
  if (maybe?.isAxiosError !== true) return false;
  const status = maybe.response?.status;
  return status === undefined || status >= 500 || status === 429;
}

// Response header names arrive lower-cased — Node's HTTP parser lower-cases
// them and axios exposes them as own properties (Verified-on: axios@1.20.0).
export function retryDelayMs(err: unknown): number {
  const maybe = err as PlaidFailureShape;
  const retryAfter = Number(maybe?.response?.headers?.['retry-after']);
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(retryAfter * 1000, MAX_RETRY_AFTER_MS);
  }
  return TRANSIENT_RETRY_DELAY_MS;
}

async function retryOnce<T>(task: () => Promise<T>): Promise<T> {
  try {
    return await task();
  } catch (err) {
    if (!isTransientPlaidFailure(err)) throw err;
    await sleep(retryDelayMs(err));
    return task();
  }
}

// With an access token, Plaid Link opens in update mode for that item
// (products must be omitted).
export async function createLinkToken(accessToken?: string): Promise<string> {
  const configs: LinkTokenCreateRequest = {
    user: { client_user_id: 'spendright-user' },
    client_name: 'SpendRight',
    country_codes: getCountryCodes(),
    language: getLanguage(),
    ...(accessToken !== undefined ? { access_token: accessToken } : { products: getProducts() }),
  };

  const response = await retryOnce(() => getClient().linkTokenCreate(configs));
  return response.data.link_token;
}

export async function exchangePublicToken(
  publicToken: string,
): Promise<{ accessToken: string; itemId: string }> {
  const response = await retryOnce(() =>
    getClient().itemPublicTokenExchange({ public_token: publicToken }),
  );
  return {
    accessToken: response.data.access_token,
    itemId: response.data.item_id,
  };
}

function toProviderItem(item: ItemWithConsentFields): ProviderItem {
  return {
    institutionId: item.institution_id ?? null,
    institutionName: item.institution_name ?? null,
  };
}

function toProviderAccount(account: AccountBase): ProviderAccount {
  return {
    accountId: account.account_id,
    name: account.name,
    officialName: account.official_name,
    mask: account.mask,
    type: account.type,
    subtype: account.subtype,
    balanceAvailable: account.balances.available,
    balanceCurrent: account.balances.current,
    balanceLimit: account.balances.limit,
    // Plaid populates exactly one of these two.
    isoCurrencyCode: account.balances.iso_currency_code,
    unofficialCurrencyCode: account.balances.unofficial_currency_code,
  };
}

function toProviderTransaction(txn: PlaidTransaction): ProviderTransaction {
  return {
    transactionId: txn.transaction_id,
    accountId: txn.account_id,
    date: txn.date,
    name: txn.name,
    merchantName: txn.merchant_name ?? null,
    amount: txn.amount,
    isoCurrencyCode: txn.iso_currency_code,
    unofficialCurrencyCode: txn.unofficial_currency_code,
    category: txn.personal_finance_category?.primary ?? txn.category?.[0] ?? null,
    pending: txn.pending,
    pendingTransactionId: txn.pending_transaction_id,
    raw: txn,
  };
}

export async function getItem(accessToken: string): Promise<ProviderItem> {
  const response = await retryOnce(() => getClient().itemGet({ access_token: accessToken }));
  return toProviderItem(response.data.item);
}

export async function getInstitutionById(
  institutionId: string,
): Promise<{ logo: string | null; primaryColor: string | null; name: string }> {
  const response = await retryOnce(() =>
    getClient().institutionsGetById({
      institution_id: institutionId,
      country_codes: getCountryCodes(),
      options: { include_optional_metadata: true },
    }),
  );
  const inst = response.data.institution;
  return {
    logo: inst.logo ?? null,
    primaryColor: inst.primary_color ?? null,
    name: inst.name,
  };
}

export async function getAccounts(accessToken: string): Promise<ProviderAccount[]> {
  const response = await retryOnce(() => getClient().accountsGet({ access_token: accessToken }));
  return response.data.accounts.map(toProviderAccount);
}

export async function removeItem(accessToken: string): Promise<string> {
  const response = await retryOnce(() => getClient().itemRemove({ access_token: accessToken }));
  return response.data.request_id;
}

// Cumulative across a whole drain, not per stall.
const DEFAULT_NOT_READY_RETRIES = 10;
const NOT_READY_DELAY_MS = 2000;

// Plaid's documented maximum page size.
const SYNC_PAGE_SIZE = 500;

const MAX_SYNC_PAGES = 200;

export interface SyncOptions {
  notReadyRetries?: number;
}

export async function syncTransactions(
  accessToken: string,
  initialCursor?: string | null,
  options?: SyncOptions,
): Promise<ProviderSyncBatch> {
  const client = getClient();
  let cursor: string | null = initialCursor ?? null;
  const added: ProviderTransaction[] = [];
  const modified: ProviderTransaction[] = [];
  const removed: ProviderRemovedTransaction[] = [];
  let hasMore = true;
  let notReadyRetries = 0;
  const notReadyBudget = options?.notReadyRetries ?? DEFAULT_NOT_READY_RETRIES;

  let pages = 0;
  let incomplete = false;
  while (hasMore) {
    // Each page's cursor is a valid resume point, so a backlog larger than
    // the budget is persisted as far as it got and the next sync continues
    // from there instead of refetching the same pages forever.
    if (++pages > MAX_SYNC_PAGES) {
      incomplete = true;
      break;
    }
    const response = await retryOnce(() =>
      client.transactionsSync({
        access_token: accessToken,
        cursor: cursor ?? undefined,
        count: SYNC_PAGE_SIZE,
      }),
    );
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
    added.push(...data.added.map(toProviderTransaction));
    modified.push(...data.modified.map(toProviderTransaction));
    removed.push(...data.removed.map((r) => ({ transactionId: r.transaction_id })));
    hasMore = data.has_more;
  }

  return { added, modified, removed, cursor, incomplete };
}
