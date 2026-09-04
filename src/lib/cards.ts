import type { CardRow } from '@/db/schema';

// The single definition of how a Plaid account name resolves to a card
// (case-insensitive exact match on cards.plaid_account_names). Callers pass
// the card list they already hold — keep this module free of db imports so
// scripts can use it without opening a connection pool.
export function matchCard(cardList: CardRow[], accountName: string | null): CardRow | null {
  if (!accountName) return null;
  const normalized = accountName.trim().toLowerCase();
  return (
    cardList.find((card) =>
      (card.plaidAccountNames ?? []).some((n) => n.trim().toLowerCase() === normalized),
    ) ?? null
  );
}
