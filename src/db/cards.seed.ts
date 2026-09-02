// Card catalog seed data. Edit this file to add/update cards, then run:
//   npm run seed:cards
//
// - `slug` is the stable identity of a card: changing rates/categories/matchers
//   updates the existing card; changing the slug creates a new one.
// - `type`: 'cashback' → category rates are cashback percentages;
//   'points' → category rates are point multipliers.
// - `plaidAccountNames`: Plaid account names that resolve to this card
//   (case-insensitive exact match). An account's name shows on the home page.
// - Removing a category from a card deletes it; transactions that used it
//   keep their stored rate but lose the category link.

export interface CardSeed {
  slug: string;
  name: string;
  issuer?: string;
  type: 'cashback' | 'points';
  plaidAccountNames: string[];
  categories: { name: string; rate: number }[];
}

export const cardSeeds: CardSeed[] = [
  {
    slug: 'amex-blue-cash-preferred',
    name: 'American Express Blue Cash Preferred',
    issuer: 'American Express',
    type: 'cashback',
    plaidAccountNames: ['Blue Cash Preferred®'],
    categories: [
      { name: 'Groceries', rate: 6 },
      { name: 'Select Streaming Services', rate: 6 },
      { name: 'Transit', rate: 3 },
      { name: 'Gas', rate: 3 },
      { name: 'Other', rate: 1 },
    ],
  },
];
