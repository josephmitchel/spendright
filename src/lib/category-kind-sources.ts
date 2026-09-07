import { cardCategories, creditCategories } from '@/db/schema';
import type { CategoryKind } from '@/lib/category-kinds';

// Design: category-kind-sign-rule, categories-retired-not-deleted.
export interface CategoryKindSource {
  table: typeof cardCategories | typeof creditCategories;
  retiredPickMessage: string;
}

export const categoryKindSources = {
  card: {
    table: cardCategories,
    retiredPickMessage: 'That category is no longer offered for this card — reload and pick again',
  },
  credit: {
    table: creditCategories,
    retiredPickMessage: 'That category is no longer offered — reload and pick again',
  },
} satisfies Record<CategoryKind, CategoryKindSource>;
