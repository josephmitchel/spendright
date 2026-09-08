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

type CardCatalogSource = Pick<NodePgDatabase, 'select'>;

// Design: card-catalog-in-code, account-card-matching-by-name.
export function loadCardCatalog(source: CardCatalogSource): Promise<CardRow[]> {
  return source.select().from(cards).orderBy(cards.id);
}

export type CardWithCategories = CardRow & { categories: CardCategoryRow[] };

export interface OfferedCatalog {
  cards: CardWithCategories[];
  creditCategories: CreditCategoryRow[];
}

// Design: categories-retired-not-deleted, list-endpoints-ordered.
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
