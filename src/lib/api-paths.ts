// Design: client-pages-fetch-api.
export const apiPaths = {
  accounts: '/api/accounts',
  account: (accountId: string) => `/api/accounts/${encodeURIComponent(accountId)}`,
  cards: '/api/cards',
  exchange: '/api/exchange',
  items: '/api/items',
  item: (itemId: string) => `/api/items/${encodeURIComponent(itemId)}`,
  itemLinkToken: (itemId: string) => `/api/items/${encodeURIComponent(itemId)}/link-token`,
  linkToken: '/api/link-token',
  sync: '/api/sync',
  transactions: (accountId: string, limit: number, offset: number) =>
    `/api/transactions?accountId=${encodeURIComponent(accountId)}&limit=${limit}&offset=${offset}`,
  transaction: (transactionId: string) => `/api/transactions/${encodeURIComponent(transactionId)}`,
} as const;
