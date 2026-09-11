import { getTableColumns } from 'drizzle-orm';
import { accounts, items, transactions } from '@/db/schema';

// The single registry of columns that must never reach an API response.
// Every public projection is built here by subtraction, so excluding a new
// sensitive column means adding it to one list.
export const SENSITIVE_COLUMNS = {
  items: ['accessToken', 'institutionLogo'],
  accounts: [],
  transactions: ['plaidTransaction'],
} as const;

function omit<T extends object, K extends readonly (keyof T)[]>(
  source: T,
  keys: K,
): Omit<T, K[number]> {
  const result = { ...source } as Record<PropertyKey, unknown>;
  for (const key of keys) delete result[key];
  return result as Omit<T, K[number]>;
}

export const servedItemColumns = omit(getTableColumns(items), SENSITIVE_COLUMNS.items);
export const servedAccountColumns = omit(getTableColumns(accounts), SENSITIVE_COLUMNS.accounts);
export const servedTransactionColumns = omit(
  getTableColumns(transactions),
  SENSITIVE_COLUMNS.transactions,
);
