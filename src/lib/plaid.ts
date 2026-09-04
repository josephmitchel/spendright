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

// PLAID_ENV resolved to a base URL, and VALIDATED rather than indexed blind
// (decided 2026-09-03). PlaidEnvironments holds exactly two keys in plaid v41 —
// `sandbox` and `production`; the `development` environment Plaid ran for years
// is gone from the SDK. An unrecognized value therefore indexes to `undefined`,
// and the SDK reads a falsy basePath as "unset", not as an error:
// Configuration does `configuration.basePath || this.basePath`, and this.basePath
// defaults to BASE_PATH = https://production.plaid.com
// (node_modules/plaid/dist/base.js). So `PLAID_ENV=development` — or a
// capitalization slip like `Sandbox` — silently sent every call to PRODUCTION,
// against real institutions and real billing, with nothing on screen saying so.
// The one misconfiguration that must never fail open is exactly the one that did.
//
// PublicError so the message survives errorResponse's suppression (see
// src/lib/errors.ts): this is an operator mistake in .env.local, and "Internal
// server error" gives them nothing to act on. It names only the offending value
// and the allowed set — no secrets.
function getBasePath(): string {
  const env = process.env.PLAID_ENV || 'sandbox';
  const basePath = PlaidEnvironments[env];
  if (!basePath) {
    throw new PublicError(
      `PLAID_ENV="${env}" is not a Plaid environment — use one of: ${Object.keys(
        PlaidEnvironments,
      ).join(', ')}`,
      { status: 500, code: 'BAD_CONFIG' },
    );
  }
  return basePath;
}

function getClient(): PlaidApi {
  const configuration = new Configuration({
    basePath: getBasePath(),
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
        'PLAID-SECRET': process.env.PLAID_SECRET,
        'Plaid-Version': '2020-09-14',
      },
    },
  });
  return new PlaidApi(configuration);
}

// Both lists come from a comma-separated env var, so each entry is trimmed and
// blanks are dropped before Plaid sees them. Written the obvious way, a
// perfectly reasonable `PLAID_PRODUCTS=transactions, liabilities` sent
// " liabilities" and `PLAID_COUNTRY_CODES=US,` sent "", and Plaid answers both
// with an opaque INVALID_FIELD on linkTokenCreate — which reads as a Plaid
// outage rather than as a stray space in .env.local. Falling back when the
// result is EMPTY as well as when the variable is unset, so a value of "," or
// " " lands on the same default rather than on an empty products array.
function splitEnvList(raw: string | undefined, fallback: string): string[] {
  const parsed = (raw ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : [fallback];
}

function getProducts(): Products[] {
  return splitEnvList(process.env.PLAID_PRODUCTS, Products.Transactions) as Products[];
}

function getCountryCodes(): CountryCode[] {
  return splitEnvList(process.env.PLAID_COUNTRY_CODES, 'US') as CountryCode[];
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
): Promise<{ accessToken: string; itemId: string; requestId: string }> {
  const response = await getClient().itemPublicTokenExchange({ public_token: publicToken });
  return {
    accessToken: response.data.access_token,
    itemId: response.data.item_id,
    requestId: response.data.request_id,
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

// How many times to re-poll transactions/sync when Plaid says the item's
// transactions are not prepared yet, at `NOT_READY_DELAY_MS` apart. The default
// is the caller that can afford to wait: POST /api/sync is a button the user
// pressed and its whole job is this poll.
//
// /api/exchange passes 3 (≈6s), because waiting there is the one place the wait
// costs something. A brand-new item is exactly when the not-ready path fires, so
// the default budget put ~22s of sleeping inside the link request — fine under
// `next dev`, a 504 on any host with a request timeout (Vercel's hobby limit is
// 10s), and the user would be told "Exchange failed" for an item that was in
// fact created.
//
// 3 rather than 0 (decided 2026-09-03) because a first sync answering with an
// empty next_cursor is the NORMAL case on a fresh item, not an edge one: at 0
// essentially every connect ended in NOT_READY, so the link button's
// "Connected, but…" notice fired every time and items.error was written and
// re-rendered as "Item error: …" on every home-page load until the user pressed
// "Sync all" by hand. That traded a working flow for a deployment this project
// has not made yet (see point 2 at the top of /api/exchange). A few seconds
// covers the common case and still leaves headroom under a 10s limit.
//
// Exceeding it loses nothing: the initial sync is reported rather than thrown
// (see the block at the end of /api/exchange), so the link returns 200, the item
// lands on the home page carrying the NOT_READY message below, and "Sync all" —
// which does get the full budget — picks it up.
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

  // NOT bounded overall: `has_more` pagination still runs to completion here,
  // and a first sync of a large item is many round trips. That is the other
  // half of the deployment risk the NOT_READY budget above addresses — see the
  // "Before deploying" note at the top of src/app/api/exchange/route.ts.
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
        // PublicError, not Error: this is the one failure in the app the user
        // can act on — it clears itself once Plaid finishes preparing the item
        // — so the message has to survive errorResponse's suppression and
        // reach the link button. 503 because it is transient by definition.
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
