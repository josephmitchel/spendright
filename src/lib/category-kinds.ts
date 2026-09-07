import type { TransactionRow } from '@/db/schema';

// Design: category-kind-sign-rule.
export type CategoryKind = 'card' | 'credit';

// Plaid sign convention: positive = outflow; zero and NaN count as spend.
export function kindForAmount(amount: string | number): CategoryKind {
  return Number(amount) < 0 ? 'credit' : 'card';
}

export const categoryKindKeys = {
  card: {
    id: 'cardCategoryId',
    name: 'cardCategoryName',
    writeColumns: ['cardCategoryId', 'rewardRate'],
  },
  credit: {
    id: 'creditCategoryId',
    name: 'creditCategoryName',
    writeColumns: ['creditCategoryId'],
  },
} as const satisfies Record<
  CategoryKind,
  { id: keyof TransactionRow; name: string; writeColumns: readonly (keyof TransactionRow)[] }
>;

// Design: category-kind-exhaustive.
export function assertNeverKind(kind: never): never {
  throw new Error(`Unhandled category kind: ${String(kind)}`);
}
