// Dependency-free — the single source of truth for the reward-type values the
// schema enum, seed data, and UI unit branch all share.
export const CARD_TYPES = ['cashback', 'points'] as const;
export type CardType = (typeof CARD_TYPES)[number];
