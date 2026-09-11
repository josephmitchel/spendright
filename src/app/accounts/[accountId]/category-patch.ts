import type { ApiTransaction } from '@/lib/api-types';
import type { categoryKindKeys, CategoryKind } from '@/lib/category-kinds';

export type CategoryPatch = Partial<
  Pick<
    ApiTransaction,
    | (typeof categoryKindKeys)[CategoryKind]['name']
    | (typeof categoryKindKeys)[CategoryKind]['writeColumns'][number]
  >
>;

export function categoryFields(row: ApiTransaction): Required<CategoryPatch> {
  return {
    cardCategoryId: row.cardCategoryId,
    cardCategoryName: row.cardCategoryName,
    rewardRate: row.rewardRate,
    creditCategoryId: row.creditCategoryId,
    creditCategoryName: row.creditCategoryName,
  };
}
