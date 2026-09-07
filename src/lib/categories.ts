import { eq, sql } from 'drizzle-orm';
import { accounts, cardCategories, creditCategories, transactions } from '@/db/schema';
import { categoryKindSources } from '@/lib/category-kind-sources';
import { assertNeverKind, kindForAmount, type CategoryKind } from '@/lib/category-kinds';
import { db, type DbTransaction } from '@/lib/db';
import { PublicError } from '@/lib/public-error';
import { servedTransactionColumns, type CategorizedTransaction } from '@/lib/transactions';

// Thrown inside db.transaction so the rejection rolls it back; PublicError
// messages are user-safe. Design: error-message-allow-list.
const badPick = (message: string) => new PublicError(message, { status: 400, code: 'BAD_REQUEST' });

// The sign-gate rejection, keyed by the kind the row's amount takes.
// Design: category-kind-sign-rule.
const wrongKindMessage = {
  card: 'Non-negative-amount transactions take a card category, not a credit category',
  credit: 'Negative-amount transactions take a credit category, not a card category',
} satisfies Record<CategoryKind, string>;

interface CategoryPick {
  updateSet: { cardCategoryId: number; rewardRate: string } | { creditCategoryId: number };
  cardCategoryName: string | null;
  creditCategoryName: string | null;
}

// Validates one pick inside the caller's row-locked transaction and returns
// the columns to write.
// Design: category-kind-sign-rule, categorization-is-a-historical-snapshot.
async function resolveCategoryPick(
  tx: DbTransaction,
  kind: CategoryKind,
  categoryId: number,
  expectedKind: CategoryKind,
  cardId: number,
): Promise<CategoryPick> {
  if (kind !== expectedKind) {
    throw badPick(wrongKindMessage[expectedKind]);
  }

  switch (kind) {
    case 'card': {
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
        throw badPick(categoryKindSources.card.retiredPickMessage);
      }
      return {
        updateSet: { cardCategoryId: category.id, rewardRate: category.rate },
        cardCategoryName: category.name,
        creditCategoryName: null,
      };
    }
    case 'credit': {
      const [category] = await tx
        .select()
        .from(creditCategories)
        .where(eq(creditCategories.id, categoryId));
      if (!category) {
        throw badPick('creditCategoryId does not exist');
      }
      if (category.retiredAt !== null) {
        throw badPick(categoryKindSources.credit.retiredPickMessage);
      }
      return {
        updateSet: { creditCategoryId: category.id },
        cardCategoryName: null,
        creditCategoryName: category.name,
      };
    }
    default:
      return assertNeverKind(kind);
  }
}

// Sets a transaction's category. The row is locked for the whole
// read-validate-write (a concurrent sync can flip the sign or delete the
// row); the bounded lock wait turns contention into a retryable 503.
// Design: category-write-contract, no-category-clear.
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
      kindForAmount(transaction.amount),
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
