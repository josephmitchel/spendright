// Pending-to-posted carry: what a reposted transaction keeps of the pending
// row's selections. Design: pending-to-posted-carry.
import { inArray } from 'drizzle-orm';
import type { Transaction as PlaidTransaction } from 'plaid';
import { transactions } from '@/db/schema';
import { categoryKindSources, type CategoryKindSource } from '@/lib/category-kind-sources';
import { assertNeverKind, type CategoryKind } from '@/lib/category-kinds';
import type { DbTransaction } from '@/lib/db';

export interface CarriedSelection {
  cardCategoryId: number | null;
  rewardRate: string | null;
  creditCategoryId: number | null;
}

// Ids from `candidateIds` whose category row still exists. A carry is a
// fresh insert, so a stale id would abort the whole sync.
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

// Plaid reposts a pending transaction under a new id (old id in `removed`,
// new one in `added` with pending_transaction_id). Resolves the selections to
// carry over before the pending rows are deleted, keyed by pending id.
// Design: pending-to-posted-carry.
export async function resolveCarriedSelections(
  tx: DbTransaction,
  added: PlaidTransaction[],
): Promise<Map<string, CarriedSelection>> {
  const carried = new Map<string, CarriedSelection>();
  const pendingIds = added
    .map((txn) => txn.pending_transaction_id)
    .filter((id): id is string => Boolean(id));
  if (pendingIds.length === 0) return carried;

  // Locked: a concurrent PATCH on a pending row would otherwise commit a
  // selection after this read decided there was nothing to carry, then lose
  // it when the row is deleted. With the lock, PATCH blocks and gets a 404
  // (row gone) or a 503 (lock timeout) instead of a false 200.
  const pendingRows = await tx
    .select({
      transactionId: transactions.transactionId,
      cardCategoryId: transactions.cardCategoryId,
      rewardRate: transactions.rewardRate,
      creditCategoryId: transactions.creditCategoryId,
    })
    .from(transactions)
    .where(inArray(transactions.transactionId, pendingIds))
    .for('update');

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
    // A rate carries on its own, without a live category link: it is a
    // historical snapshot of what the purchase earned.
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

// Carry only the kind matching the posted amount's sign; a sign flip drops
// the carry. Spend side carries on either column so an orphaned rate
// survives. Design: category-kind-sign-rule.
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
