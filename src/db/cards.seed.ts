// Edit this file, then run: npm run seed:cards
import type { CardType } from '@/lib/card-types';

interface CardSeed {
  slug: string;
  name: string;
  issuer?: string;
  type: CardType;
  plaidAccountNames: string[];
  // annualCap: past `amount` of calendar-year spend in the category, the rate
  // drops to `postCapRate` (issuer terms like "6% up to $6,000/yr, then 1%").
  categories: { name: string; rate: number; annualCap?: { amount: number; postCapRate: number } }[];
  // An in-range rate typo can't be caught mechanically, so every card must
  // attest when and where its rates were checked against issuer terms.
  ratesVerified: { on: string; source: string };
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
      { name: 'Groceries', rate: 6, annualCap: { amount: 6000, postCapRate: 1 } },
      { name: 'Select Streaming Services', rate: 6 },
      { name: 'Transit', rate: 3 },
      { name: 'Gas', rate: 3 },
      { name: 'Other', rate: 1 },
    ],
    ratesVerified: {
      on: '2026-09-07',
      source: 'americanexpress.com — Blue Cash Preferred benefit terms',
    },
  },
];
