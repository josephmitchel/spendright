// App-owned shapes for provider-ingested data, adapted in src/lib/plaid.ts.

export interface ProviderAccount {
  accountId: string;
  name: string;
  officialName: string | null;
  mask: string | null;
  type: string;
  subtype: string | null;
  balanceAvailable: number | null;
  balanceCurrent: number | null;
  balanceLimit: number | null;
  // Exactly one of these two is set by the provider.
  isoCurrencyCode: string | null;
  unofficialCurrencyCode: string | null;
}

export type RawProviderPayload = unknown;

export interface ProviderTransaction {
  transactionId: string;
  accountId: string;
  // ISO YYYY-MM-DD.
  date: string;
  name: string;
  merchantName: string | null;
  // Provider sign convention preserved: positive is money out.
  amount: number;
  isoCurrencyCode: string | null;
  unofficialCurrencyCode: string | null;
  category: string | null;
  pending: boolean;
  pendingTransactionId: string | null;
  raw: RawProviderPayload;
}

export interface ProviderRemovedTransaction {
  transactionId: string;
}

export interface ProviderSyncBatch {
  added: ProviderTransaction[];
  modified: ProviderTransaction[];
  removed: ProviderRemovedTransaction[];
  cursor: string | null;
}

export interface ProviderItem {
  institutionId: string | null;
  institutionName: string | null;
}
