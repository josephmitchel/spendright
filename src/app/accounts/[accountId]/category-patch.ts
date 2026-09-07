import type { ApiTransaction } from '@/lib/api-types';
import type { categoryKindKeys, CategoryKind } from '@/lib/category-kinds';

// The category columns a PATCH can change (every kind's name and write
// columns, derived from categoryKindKeys) — the widest write
// applyCategoryPatch accepts. Design: optimistic-category-writes.
export type CategoryPatch = Partial<
  Pick<
    ApiTransaction,
    | (typeof categoryKindKeys)[CategoryKind]['name']
    | (typeof categoryKindKeys)[CategoryKind]['writeColumns'][number]
  >
>;

// Every category column of one row. Required<>: a kind added to
// categoryKindKeys widens CategoryPatch, so omitting its columns here is a
// compile error instead of a field the reconcile silently drops.
// Design: category-kind-exhaustive.
export function categoryFields(row: ApiTransaction): Required<CategoryPatch> {
  return {
    cardCategoryId: row.cardCategoryId,
    cardCategoryName: row.cardCategoryName,
    rewardRate: row.rewardRate,
    creditCategoryId: row.creditCategoryId,
    creditCategoryName: row.creditCategoryName,
  };
}
