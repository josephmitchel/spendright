import type { CardRow } from '@/db/schema';

export function normalizeAccountName(name: string): string {
  return name.trim().toLowerCase();
}

// Design: account-card-matching-by-name, categories-retired-not-deleted.
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
