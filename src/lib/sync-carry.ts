import { inArray } from 'drizzle-orm';
import { transactions } from '@/db/schema';
import { categoryKindSources, type CategoryKindSource } from '@/lib/category-kind-sources';
import { assertNeverKind, type CategoryKind } from '@/lib/category-kinds';
import { chunkArray, ID_CHUNK_SIZE } from '@/lib/chunk';
import type { DbTransaction } from '@/lib/db';
import type { ProviderTransaction } from '@/lib/provider-types';

export interface CarriedSelection {
  cardCategoryId: number | null;
  rewardRate: string | null;
  creditCategoryId: number | null;
}

// A carry is a fresh insert, so a stale category id would abort the whole sync.
async function liveCategoryIds(
  tx: DbTransaction,
  { table }: CategoryKindSource,
  candidateIds: (number | null)[],
): Promise<Set<number>> {
  const ids = [...new Set(candidateIds.filter((id): id is number => id !== null))];
  if (ids.length === 0) return new Set();
  const rows = await tx.select({ id: table.id }).from(table).where(inArray(table.id, ids));
  return new Set(rows.map((row) => row.id));
}

// Plaid reposts a pending transaction under a new id, carrying the old one
// in pending_transaction_id.
export async function resolveCarriedSelections(
  tx: DbTransaction,
  added: ProviderTransaction[],
): Promise<Map<string, CarriedSelection>> {
  const carried = new Map<string, CarriedSelection>();
  const pendingIds = added
    .map((txn) => txn.pendingTransactionId)
    .filter((id): id is string => Boolean(id));
  if (pendingIds.length === 0) return carried;

  // Locked: a concurrent PATCH could otherwise commit a selection after this
  // read and lose it when the pending row is deleted.
  const pendingRows = [];
  for (const ids of chunkArray(pendingIds, ID_CHUNK_SIZE)) {
    pendingRows.push(
      ...(await tx
        .select({
          transactionId: transactions.transactionId,
          cardCategoryId: transactions.cardCategoryId,
          rewardRate: transactions.rewardRate,
          creditCategoryId: transactions.creditCategoryId,
        })
        .from(transactions)
        .where(inArray(transactions.transactionId, ids))
        .for('update')),
    );
  }

  const liveCardCategoryIds = await liveCategoryIds(
    tx,
    categoryKindSources.card,
    pendingRows.map((row) => row.cardCategoryId),
  );
  const liveCreditCategoryIds = await liveCategoryIds(
    tx,
    categoryKindSources.credit,
    pendingRows.map((row) => row.creditCategoryId),
  );

  for (const row of pendingRows) {
    const cardCategoryExists =
      row.cardCategoryId !== null && liveCardCategoryIds.has(row.cardCategoryId);
    const creditCategoryExists =
      row.creditCategoryId !== null && liveCreditCategoryIds.has(row.creditCategoryId);
    // A rate carries without a live category link: it is a historical snapshot.
    if (cardCategoryExists || creditCategoryExists || row.rewardRate !== null) {
      carried.set(row.transactionId, {
        cardCategoryId: cardCategoryExists ? row.cardCategoryId : null,
        rewardRate: row.rewardRate,
        creditCategoryId: creditCategoryExists ? row.creditCategoryId : null,
      });
    }
  }
  return carried;
}

export function carriedColumns(
  carry: CarriedSelection | undefined,
  kind: CategoryKind,
):
  | { creditCategoryId: number }
  | { cardCategoryId: number | null; rewardRate: string | null }
  | null {
  if (!carry) return null;
  switch (kind) {
    case 'credit':
      return carry.creditCategoryId != null ? { creditCategoryId: carry.creditCategoryId } : null;
    case 'card':
      return carry.cardCategoryId != null || carry.rewardRate != null
        ? { cardCategoryId: carry.cardCategoryId, rewardRate: carry.rewardRate }
        : null;
    default:
      return assertNeverKind(kind);
  }
}
