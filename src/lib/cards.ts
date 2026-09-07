import type { CardRow } from '@/db/schema';

// Match-key normalization, shared with the seed validator.
// Design: account-card-matching-by-name.
export function normalizeAccountName(name: string): string {
  return name.trim().toLowerCase();
}

// Case-insensitive exact match on cards.plaid_account_names; retired cards
// never match. Design: account-card-matching-by-name,
// categories-retired-not-deleted.
export function matchCard(cardList: CardRow[], accountName: string | null): CardRow | null {
  if (!accountName) return null;
  const normalized = normalizeAccountName(accountName);
  return (
    cardList.find(
      (card) =>
        card.retiredAt === null &&
        (card.plaidAccountNames ?? []).some((n) => normalizeAccountName(n) === normalized),
    ) ?? null
  );
}
