// Edit this file, then run: npm run seed:cards
// Design: card-catalog-in-code.

interface CardSeed {
  slug: string;
  name: string;
  issuer?: string;
  type: 'cashback' | 'points';
  plaidAccountNames: string[];
  categories: { name: string; rate: number }[];
}

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
