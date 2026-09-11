import { and, eq, ne, sql } from 'drizzle-orm';
import {
  accounts,
  cardCategories,
  creditCategories,
  transactions,
  type CardCategoryRow,
  type TransactionRow,
} from '@/db/schema';
import { categoryKindSources } from '@/lib/category-kind-sources';
import { assertNeverKind, kindForAmount, type CategoryKind } from '@/lib/category-kinds';
import { db, type DbTransaction } from '@/lib/db';
import { pgErrorCode } from '@/lib/pg-errors';
import { PublicError } from '@/lib/public-error';
import { servedTransactionColumns, type CategorizedTransaction } from '@/lib/transactions';

const badPick = (message: string) => new PublicError(message, { status: 400, code: 'BAD_REQUEST' });

const wrongKindMessage = {
  card: 'Non-negative-amount transactions take a card category, not a credit category',
  credit: 'Negative-amount transactions take a credit category, not a card category',
} satisfies Record<CategoryKind, string>;

interface CategoryPick {
  updateSet: { cardCategoryId: number; rewardRate: string } | { creditCategoryId: number };
  cardCategoryName: string | null;
  creditCategoryName: string | null;
}

// The snapshot honors the category's annual cap: once the calendar year of
// the transaction's date already holds >= annualCapAmount of categorized
// spend (this transaction excluded), postCapRate applies. A transaction that
// straddles the boundary still gets the pre-cap rate.
async function effectiveCardRate(
  tx: DbTransaction,
  category: CardCategoryRow,
  transaction: Pick<TransactionRow, 'transactionId' | 'date'>,
): Promise<string> {
  if (category.annualCapAmount === null || category.postCapRate === null) return category.rate;
  const year = Number(transaction.date.slice(0, 4));
  const [row] = await tx
    .select({ spent: sql<string>`coalesce(sum(${transactions.amount}), 0)` })
    .from(transactions)
    .where(
      and(
        eq(transactions.cardCategoryId, category.id),
        sql`extract(year from ${transactions.date}) = ${year}`,
        ne(transactions.transactionId, transaction.transactionId),
      ),
    );
  return Number(row?.spent ?? 0) >= Number(category.annualCapAmount)
    ? category.postCapRate
    : category.rate;
}

async function resolveCategoryPick(
  tx: DbTransaction,
  kind: CategoryKind,
  categoryId: number,
  expectedKind: CategoryKind,
  cardId: number,
  transaction: Pick<TransactionRow, 'transactionId' | 'date'>,
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
      if (category.retiredAt !== null) {
        throw badPick(categoryKindSources.card.retiredPickMessage);
      }
      return {
        updateSet: {
          cardCategoryId: category.id,
          rewardRate: await effectiveCardRate(tx, category, transaction),
        },
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

    // Lock order is transactions-then-accounts.
    const [account] = await tx
      .select()
      .from(accounts)
      .where(eq(accounts.accountId, transaction.accountId))
      .for('share');
    if (!account?.cardId) {
      throw badPick('This account has no matched card definition');
    }

    const pick = await resolveCategoryPick(
      tx,
      kind,
      categoryId,
      kindForAmount(transaction.amount),
      account.cardId,
      transaction,
    );

    const [updated] = await tx
      .update(transactions)
      .set({ ...pick.updateSet, updatedAt: sql`now()` })
      .where(eq(transactions.transactionId, transactionId))
      .returning(servedTransactionColumns)
      .catch((err: unknown) => {
        // 23503 foreign_key_violation
        if (pgErrorCode(err) === '23503') {
          throw new PublicError('That category no longer exists — reload the page and pick again', {
            status: 409,
            code: 'CATEGORY_REMOVED',
          });
        }
        throw err;
      });
    if (!updated) {
      throw new PublicError('Transaction not found', { status: 404, code: 'NOT_FOUND' });
    }

    return {
      ...updated,
      cardCategoryName: pick.cardCategoryName,
      creditCategoryName: pick.creditCategoryName,
    };
  });
}
