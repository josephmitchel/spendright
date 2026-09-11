import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cardCategories, cards, creditCategories, transactions } from '@/db/schema';
import { setTransactionCategory } from '@/lib/categories';
import { db, pool } from '@/lib/db';
import { PublicError } from '@/lib/public-error';
import {
  endPools,
  seedAccount,
  seedCardWithCategory,
  seedCreditCategory,
  seedItem,
  transactionRow,
  truncateAll,
} from '../../test/db-fixtures';

let cardId: number;
let categoryId: number;

async function insertTxn(
  transactionId: string,
  over: Partial<typeof transactions.$inferInsert> = {},
) {
  await db.insert(transactions).values({
    transactionId,
    accountId: 'acc-1',
    itemId: 'itm-1',
    date: '2026-09-01',
    amount: '25',
    pending: false,
    plaidTransaction: {},
    ...over,
  });
}

// Positive signal that setTransactionCategory's UPDATE is blocked on the
// concurrent session's row lock, instead of a wall-clock sleep.
async function waitForLockWaiter(): Promise<void> {
  const deadline = Date.now() + 5_000;
  for (;;) {
    const { rows } = await pool.query<{ waiting: boolean }>(
      'select count(*)::int > 0 as waiting from pg_locks where not granted',
    );
    if (rows[0]?.waiting) return;
    if (Date.now() > deadline) throw new Error('no lock waiter appeared');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

beforeEach(async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  await truncateAll();
  await seedItem('itm-1');
  ({ cardId, categoryId } = await seedCardWithCategory());
  await seedAccount('acc-1', 'itm-1', { cardId });
  await insertTxn('txn-pos', { amount: '25' });
  await insertTxn('txn-neg', { amount: '-40' });
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await endPools();
});

describe('setTransactionCategory', () => {
  it('assigns a card category and snapshots its rate', async () => {
    const updated = await setTransactionCategory('txn-pos', 'card', categoryId);
    expect(updated).toMatchObject({
      cardCategoryId: categoryId,
      rewardRate: '6',
      cardCategoryName: 'Groceries',
      creditCategoryName: null,
    });
    expect(await transactionRow('txn-pos')).toMatchObject({
      cardCategoryId: categoryId,
      rewardRate: '6',
    });
  });

  it('assigns a credit category to a negative-amount transaction', async () => {
    const creditId = await seedCreditCategory('Refund');
    const updated = await setTransactionCategory('txn-neg', 'credit', creditId);
    expect(updated).toMatchObject({
      creditCategoryId: creditId,
      creditCategoryName: 'Refund',
      cardCategoryName: null,
    });
    expect(await transactionRow('txn-neg')).toMatchObject({
      creditCategoryId: creditId,
      rewardRate: null,
    });
  });

  it('rejects a card category on a negative amount', async () => {
    await expect(setTransactionCategory('txn-neg', 'card', categoryId)).rejects.toMatchObject({
      status: 400,
      message: 'Negative-amount transactions take a credit category, not a card category',
    });
  });

  it('rejects a credit category on a non-negative amount', async () => {
    const creditId = await seedCreditCategory('Refund');
    await expect(setTransactionCategory('txn-pos', 'credit', creditId)).rejects.toMatchObject({
      status: 400,
      message: 'Non-negative-amount transactions take a card category, not a credit category',
    });
  });

  it('rejects a category belonging to a different card', async () => {
    const [otherCard] = await db
      .insert(cards)
      .values({ slug: 'other-card', name: 'Other Card', type: 'cashback', plaidAccountNames: [] })
      .returning({ id: cards.id });
    if (!otherCard) throw new Error('card seed failed');
    const [otherCategory] = await db
      .insert(cardCategories)
      .values({ cardId: otherCard.id, name: 'Gas', rate: '3' })
      .returning({ id: cardCategories.id });
    if (!otherCategory) throw new Error('category seed failed');

    await expect(setTransactionCategory('txn-pos', 'card', otherCategory.id)).rejects.toMatchObject(
      { status: 400, message: "cardCategoryId does not belong to this account's card" },
    );
  });

  it('rejects a retired card category', async () => {
    await db
      .update(cardCategories)
      .set({ retiredAt: new Date() })
      .where(eq(cardCategories.id, categoryId));
    await expect(setTransactionCategory('txn-pos', 'card', categoryId)).rejects.toMatchObject({
      status: 400,
      message: 'That category is no longer offered for this card — reload and pick again',
    });
  });

  it('rejects a retired credit category', async () => {
    const creditId = await seedCreditCategory('Refund');
    await db
      .update(creditCategories)
      .set({ retiredAt: new Date() })
      .where(eq(creditCategories.id, creditId));
    await expect(setTransactionCategory('txn-neg', 'credit', creditId)).rejects.toMatchObject({
      status: 400,
      message: 'That category is no longer offered — reload and pick again',
    });
  });

  it('rejects a transaction on an account with no matched card', async () => {
    await seedAccount('acc-2', 'itm-1');
    await insertTxn('txn-nocard', { accountId: 'acc-2' });
    await expect(setTransactionCategory('txn-nocard', 'card', categoryId)).rejects.toMatchObject({
      status: 400,
      message: 'This account has no matched card definition',
    });
  });

  it('404s an unknown transaction', async () => {
    await expect(setTransactionCategory('txn-missing', 'card', categoryId)).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });
  });

  it('maps a concurrently deleted category to a 409 instead of a raw FK error', async () => {
    const client = await pool.connect();
    try {
      // The uncommitted delete lets the pick's SELECT still see the category,
      // then blocks the UPDATE's FK check until commit — at which point the
      // referenced row is gone and Postgres raises 23503.
      await client.query('begin');
      await client.query('delete from spendright.card_categories where id = $1', [categoryId]);
      const patch = setTransactionCategory('txn-pos', 'card', categoryId);
      const settled = patch.then(
        () => null,
        (err: unknown) => err,
      );
      await waitForLockWaiter();
      await client.query('commit');
      const err = await settled;
      expect(err).toBeInstanceOf(PublicError);
      expect(err).toMatchObject({ status: 409, code: 'CATEGORY_REMOVED' });
      expect(await transactionRow('txn-pos')).toMatchObject({ cardCategoryId: null });
    } finally {
      client.release();
    }
  });
});

describe('annual cap snapshots', () => {
  async function capCategory(annualCapAmount: string, postCapRate: string) {
    await db
      .update(cardCategories)
      .set({ annualCapAmount, postCapRate })
      .where(eq(cardCategories.id, categoryId));
  }

  it('snapshots the post-cap rate once the calendar year is past the cap', async () => {
    await capCategory('100', '1');
    await insertTxn('txn-a', { amount: '60', cardCategoryId: categoryId, rewardRate: '6' });
    await insertTxn('txn-b', { amount: '50', cardCategoryId: categoryId, rewardRate: '6' });

    const updated = await setTransactionCategory('txn-pos', 'card', categoryId);
    expect(updated.rewardRate).toBe('1');
  });

  it('snapshots the full rate below the cap, ignoring other years', async () => {
    await capCategory('100', '1');
    // Well past the cap, but in the previous calendar year.
    await insertTxn('txn-last-year', {
      date: '2025-12-30',
      amount: '500',
      cardCategoryId: categoryId,
      rewardRate: '6',
    });
    await insertTxn('txn-a', { amount: '60', cardCategoryId: categoryId, rewardRate: '6' });

    const updated = await setTransactionCategory('txn-pos', 'card', categoryId);
    expect(updated.rewardRate).toBe('6');
  });

  it('re-picking a transaction does not count its own spend toward the cap', async () => {
    await capCategory('100', '1');
    await insertTxn('txn-big', { amount: '99', cardCategoryId: categoryId, rewardRate: '6' });

    // txn-pos (25) would cross the cap only if it counted itself twice.
    const first = await setTransactionCategory('txn-pos', 'card', categoryId);
    expect(first.rewardRate).toBe('6');
    const again = await setTransactionCategory('txn-pos', 'card', categoryId);
    expect(again.rewardRate).toBe('6');
  });

  it('an uncapped category always snapshots its flat rate', async () => {
    await insertTxn('txn-a', { amount: '5000', cardCategoryId: categoryId, rewardRate: '6' });
    const updated = await setTransactionCategory('txn-pos', 'card', categoryId);
    expect(updated.rewardRate).toBe('6');
  });
});
