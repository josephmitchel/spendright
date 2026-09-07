// Plaid sign convention: positive = outflow, negative = inflow (payment,
// refund, reward). Zero and NaN count as spend.
// Design: category-kind-sign-rule.
// Dependency-free — bundled into client code (the schema import below is
// type-only, so it is erased from the bundle).
import type { TransactionRow } from '@/db/schema';

// Spend rows take a card category, inflow rows a credit category.
// Design: category-kind-sign-rule.
export type CategoryKind = 'card' | 'credit';

// The sign rule as a kind.
export function kindForAmount(amount: string | number): CategoryKind {
  return Number(amount) < 0 ? 'credit' : 'card';
}

// Each kind's row/wire keys: the id field a PATCH writes, the joined name
// field served beside it, and the row columns that kind's selection owns
// (the card kind's rate snapshot rides with its id). Server-side
// counterpart: categoryKindSources in src/lib/category-kind-sources.ts.
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
  // writeColumns feed an on-conflict SET in src/lib/sync.ts, so a typo must
  // fail here, not render a garbage SQL key.
  { id: keyof TransactionRow; name: string; writeColumns: readonly (keyof TransactionRow)[] }
>;

// Compile-time exhaustiveness for per-kind branches: every switch over
// CategoryKind funnels its default here, so adding a kind fails to compile
// at each site instead of falling through silently.
export function assertNeverKind(kind: never): never {
  throw new Error(`Unhandled category kind: ${String(kind)}`);
}
