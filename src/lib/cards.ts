import type { CardRow } from '@/db/schema';

// The single definition of how a Plaid account name resolves to a card
// (case-insensitive exact match on cards.plaid_account_names). Callers pass
// the card list they already hold — keep this module free of db imports so
// scripts can use it without opening a connection pool.
//
// A retired card never matches. Cards leave the seed file by being retired
// rather than deleted (see the note on `cards` in src/db/schema.ts), so the
// list a caller reads straight from the table still contains them; skipping
// them here, in the one place matching is defined, is what drops an account
// on a retired card to "no card" everywhere at once.
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
