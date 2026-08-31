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

function getClient(): PlaidApi {
  const configuration = new Configuration({
    basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
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

function getProducts(): Products[] {
  return (process.env.PLAID_PRODUCTS || Products.Transactions).split(',') as Products[];
}

function getCountryCodes(): CountryCode[] {
  return (process.env.PLAID_COUNTRY_CODES || 'US').split(',') as CountryCode[];
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

// Fetch transaction changes for an item using the sync endpoint
// https://plaid.com/docs/api/products/transactions/#transactionssync
export async function syncTransactions(
  accessToken: string,
  initialCursor?: string | null,
): Promise<SyncResult> {
  const client = getClient();
  let cursor: string | null = initialCursor ?? null;
  let added: PlaidTransaction[] = [];
  let modified: PlaidTransaction[] = [];
  let removed: RemovedTransaction[] = [];
  let hasMore = true;
  let notReadyRetries = 0;

  while (hasMore) {
    const response = await client.transactionsSync({
      access_token: accessToken,
      cursor: cursor ?? undefined,
    });
    const data = response.data;

    // An empty next_cursor means Plaid hasn't finished preparing the
    // item's transactions yet — wait and retry without advancing.
    if (data.next_cursor === '') {
      if (++notReadyRetries > 10) {
        throw new Error('Plaid transactions not ready after 10 retries');
      }
      await sleep(2000);
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
