import { desc, isNull } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  cardCategories,
  cards,
  creditCategories,
  type CardCategoryRow,
  type CardRow,
  type CreditCategoryRow,
} from '@/db/schema';

// Any drizzle executor: the app db, a transaction, or the seed script's
// schemaless client — a parameter, so this module needs no db import.
type CardCatalogSource = Pick<NodePgDatabase, 'select'>;

// Ordered so card matching never depends on physical row order. A failure
// must propagate: storing accounts against an empty catalog would null their
// card matches. Design: single-card-catalog-loader,
// account-card-matching-by-name, rematch-on-every-sync.
export function loadCardCatalog(source: CardCatalogSource): Promise<CardRow[]> {
  return source.select().from(cards).orderBy(cards.id);
}

export type CardWithCategories = CardRow & { categories: CardCategoryRow[] };

export interface OfferedCatalog {
  cards: CardWithCategories[];
  creditCategories: CreditCategoryRow[];
}

// The catalog as the pickers offer it: retired rows are not offered.
// Design: categories-retired-not-deleted, picker-ordering.
export async function listOfferedCards(source: CardCatalogSource): Promise<OfferedCatalog> {
  const [cardRows, categoryRows, creditCategoryRows] = await Promise.all([
    source.select().from(cards).where(isNull(cards.retiredAt)).orderBy(cards.name),
    source
      .select()
      .from(cardCategories)
      .where(isNull(cardCategories.retiredAt))
      .orderBy(desc(cardCategories.rate), cardCategories.name),
    source
      .select()
      .from(creditCategories)
      .where(isNull(creditCategories.retiredAt))
      .orderBy(creditCategories.name),
  ]);
  return {
    cards: cardRows.map((card) => ({
      ...card,
      categories: categoryRows.filter((category) => category.cardId === card.id),
    })),
    creditCategories: creditCategoryRows,
  };
}
