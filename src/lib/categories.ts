import { eq, getTableColumns, sql } from 'drizzle-orm';
import {
  accounts,
  cardCategories,
  creditCategories,
  transactions,
  type TransactionRow,
} from '@/db/schema';
import type { DbTransaction } from '@/lib/db';
import { isInflowAmount, type CategoryKind } from '@/lib/amounts';
import { db } from '@/lib/db';
import { PublicError } from '@/lib/public-error';

// Every column except the raw Plaid payload — the single definition of which
// transaction columns are served, shared by every query that projects
// transaction rows toward the client. The exclusion is made once, here, in
// the runtime pick; the served row type below is derived from it, so a column
// can never be excluded at the type level but still served (or vice versa).
// Design: raw-plaid-payload-stored-not-served.
const { plaidTransaction: _plaidTransaction, ...servedTransactionColumns } =
  getTableColumns(transactions);
export { servedTransactionColumns };

// The updated row with both joined category names; the kind not written is
// null by the sign constraint, so no second lookup is made.
export type CategorizedTransaction = Pick<
  TransactionRow,
  keyof typeof servedTransactionColumns & keyof TransactionRow
> & {
  cardCategoryName: string | null;
  creditCategoryName: string | null;
};

// Rejections decided inside the transaction are thrown (db.transaction
// commits on return, so a throw is what rolls it back) as PublicError, whose
// message is user-safe by contract. Design: error-message-allow-list.
const badPick = (message: string) => new PublicError(message, { status: 400, code: 'BAD_REQUEST' });

interface CategoryPick {
  updateSet: { cardCategoryId: number; rewardRate: string } | { creditCategoryId: number };
  cardCategoryName: string | null;
  creditCategoryName: string | null;
}

// Validates one pick inside the caller's row-locked transaction and returns
// the columns to write. The kinds share the sign gate; the lookups differ in
// table, the card-ownership check, and whether a rate snapshot is taken.
// Design: category-kind-sign-rule, categorization-is-a-historical-snapshot.
async function resolveCategoryPick(
  tx: DbTransaction,
  kind: CategoryKind,
  categoryId: number,
  isInflow: boolean,
  cardId: number,
): Promise<CategoryPick> {
  if (isInflow !== (kind === 'credit')) {
    throw badPick(
      isInflow
        ? 'Negative-amount transactions take a credit category, not a card category'
        : 'Positive-amount transactions take a card category, not a credit category',
    );
  }

  if (kind === 'card') {
    const [category] = await tx
      .select()
      .from(cardCategories)
      .where(eq(cardCategories.id, categoryId));
    if (!category || category.cardId !== cardId) {
      throw badPick("cardCategoryId does not belong to this account's card");
    }
    // Retired categories keep old links but take no new picks.
    // Design: categories-retired-not-deleted.
    if (category.retiredAt !== null) {
      throw badPick('That category is no longer offered for this card — reload and pick again');
    }
    return {
      updateSet: { cardCategoryId: category.id, rewardRate: category.rate },
      cardCategoryName: category.name,
      creditCategoryName: null,
    };
  }

  const [category] = await tx
    .select()
    .from(creditCategories)
    .where(eq(creditCategories.id, categoryId));
  if (!category) {
    throw badPick('creditCategoryId does not exist');
  }
  if (category.retiredAt !== null) {
    throw badPick('That category is no longer offered — reload and pick again');
  }
  return {
    updateSet: { creditCategoryId: category.id },
    cardCategoryName: null,
    creditCategoryName: category.name,
  };
}

// Sets a transaction's category. The row is locked for the whole
// read-validate-write: a concurrent sync can flip the amount's sign or delete
// the row. The lock wait is bounded so a long sync or seed run yields a
// retryable failure (errorResponse maps 55P03 to a 503) instead of pinning a
// connection. Design: category-write-contract, no-category-clear.
export async function setTransactionCategory(
  transactionId: string,
  kind: CategoryKind,
  categoryId: number,
): Promise<CategorizedTransaction> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local lock_timeout = '3s'`);
    const [transaction] = await tx
      .select()
      .from(transactions)
      .where(eq(transactions.transactionId, transactionId))
      .for('update');
    if (!transaction) {
      throw new PublicError('Transaction not found', { status: 404, code: 'NOT_FOUND' });
    }

    // `for share` so a seed re-match cannot rewrite accounts.card_id between
    // this read and the commit. Lock order is transactions-then-accounts.
    const [account] = await tx
      .select()
      .from(accounts)
      .where(eq(accounts.accountId, transaction.accountId))
      .for('share');
    // Design: supported-account-rule.
    if (!account?.cardId) {
      throw badPick('This account has no matched card definition');
    }

    const pick = await resolveCategoryPick(
      tx,
      kind,
      categoryId,
      isInflowAmount(transaction.amount),
      account.cardId,
    );

    const [updated] = await tx
      .update(transactions)
      .set({ ...pick.updateSet, updatedAt: sql`now()` })
      .where(eq(transactions.transactionId, transactionId))
      .returning(servedTransactionColumns);
    if (!updated) {
      // Unreachable while the row lock is held; satisfies the checked index.
      throw new PublicError('Transaction not found', { status: 404, code: 'NOT_FOUND' });
    }

    return {
      ...updated,
      cardCategoryName: pick.cardCategoryName,
      creditCategoryName: pick.creditCategoryName,
    };
  });
}
