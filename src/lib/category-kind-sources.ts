import { cardCategories, creditCategories } from '@/db/schema';
import type { CategoryKind } from '@/lib/category-kinds';

// Each kind's server-side pieces: the category table paired with its own id
// column (kind-generic queries take the whole pair) and the retired-pick
// wording. Client-safe counterpart: categoryKindKeys in
// src/lib/category-kinds.ts.
// Design: category-kind-sign-rule, categories-retired-not-deleted.
export interface CategoryKindSource {
  table: typeof cardCategories | typeof creditCategories;
  idColumn: typeof cardCategories.id | typeof creditCategories.id;
  retiredPickMessage: string;
}

export const categoryKindSources = {
  card: {
    table: cardCategories,
    idColumn: cardCategories.id,
    retiredPickMessage: 'That category is no longer offered for this card — reload and pick again',
  },
  credit: {
    table: creditCategories,
    idColumn: creditCategories.id,
    retiredPickMessage: 'That category is no longer offered — reload and pick again',
  },
} satisfies Record<CategoryKind, CategoryKindSource>;
