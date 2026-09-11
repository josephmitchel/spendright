import type { CardRow } from '@/db/schema';

// Institutions drift on punctuation and trademark glyphs (®, ™, hyphens), so
// matching keys on letters/digits only, single-spaced.
export function normalizeAccountName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export interface MatchableAccount {
  name: string | null;
  officialName?: string | null;
}

export function matchCard(cardList: CardRow[], account: MatchableAccount): CardRow | null {
  // name first: it is what the seed lists; officialName is the fallback for
  // a user-renamed account.
  const candidates = [account.name, account.officialName]
    .filter((value): value is string => Boolean(value))
    .map(normalizeAccountName)
    .filter(Boolean);
  for (const candidate of candidates) {
    const card = cardList.find(
      (entry) =>
        entry.retiredAt === null &&
        (entry.plaidAccountNames ?? []).some((name) => normalizeAccountName(name) === candidate),
    );
    if (card) return card;
  }
  return null;
}
