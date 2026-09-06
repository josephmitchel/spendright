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

// Any drizzle executor: the app db, one of its transactions, or the seed
// script's schemaless client. Taking it as a parameter keeps this module free
// of the db import, like matchCard's module, so the seed script can use it
// without opening a second pool.
type CardCatalogSource = Pick<NodePgDatabase, 'select'>;

// The single loader for matchCard's input, shared by the link flow, the sync
// path, and the seed script. Ordered so card matching never depends on
// physical row order. A failure propagates to the caller's operation: storing
// accounts against an empty catalog would overwrite their card matches with
// null (card_id is re-matched on every write), so no caller stores accounts
// without it. Design: account-card-matching-by-name, rematch-on-every-sync.
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
