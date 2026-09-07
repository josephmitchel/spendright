import { cardCategories, creditCategories } from '@/db/schema';
import type { CategoryKind } from '@/lib/category-kinds';

// Each kind's server-side pieces: the category table (kind-generic queries
// read its id as `table.id`, so no separately declared column can pair with
// the wrong table) and the retired-pick wording. Client-safe counterpart:
// categoryKindKeys in src/lib/category-kinds.ts.
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
