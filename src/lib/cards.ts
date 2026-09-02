import { cards, type CardRow } from '@/db/schema';
import { db } from '@/lib/db';

export function matchCard(cardList: CardRow[], accountName: string | null): CardRow | null {
  if (!accountName) return null;
  const normalized = accountName.trim().toLowerCase();
  return (
    cardList.find((card) =>
      (card.plaidAccountNames ?? []).some((n) => n.trim().toLowerCase() === normalized),
    ) ?? null
  );
}

export async function resolveCardId(accountName: string | null): Promise<number | null> {
  if (!accountName) return null;
  const cardList = await db.select().from(cards);
  return matchCard(cardList, accountName)?.id ?? null;
}
