// Card catalog seed data. Edit this file, then run: npm run seed:cards
// - `slug` is a card's stable identity; changing it creates a new card.
// - `type`: 'cashback' → rates are percentages; 'points' → point multipliers.
// - `plaidAccountNames`: case-insensitive exact match on the Plaid account
//   name (shown on the home page). Add a name here to support an account.
// - Removing a card or category retires it; adding it back revives it.
// Design: card-catalog-in-code.

export interface CardSeed {
  slug: string;
  name: string;
  issuer?: string;
  type: 'cashback' | 'points';
  plaidAccountNames: string[];
  categories: { name: string; rate: number }[];
}

// Global, rate-less categories for inflow transactions (negative amounts).
export const creditCategorySeeds: string[] = [
  'Credit Card Payment',
  'Refund',
  'Rewards',
  'Statement Credit',
  'Other',
];

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
