import type { CardRow } from '@/db/schema';

// The single definition of how a Plaid account name resolves to a card:
// case-insensitive exact match on cards.plaid_account_names. Retired cards
// never match. No db imports, so scripts can use it without a pool.
// Design: account-card-matching-by-name, categories-retired-not-deleted.
export function matchCard(cardList: CardRow[], accountName: string | null): CardRow | null {
  if (!accountName) return null;
  const normalized = accountName.trim().toLowerCase();
  return (
    cardList.find(
      (card) =>
        card.retiredAt === null &&
        (card.plaidAccountNames ?? []).some((n) => n.trim().toLowerCase() === normalized),
    ) ?? null
  );
}
