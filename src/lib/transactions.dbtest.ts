import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { transactions } from '@/db/schema';
import { db } from '@/lib/db';
import { listTransactions } from '@/lib/transactions';
import {
  endPools,
  seedAccount,
  seedCardWithCategory,
  seedCreditCategory,
  seedItem,
  truncateAll,
} from '../../test/db-fixtures';

async function insertTxn(
  transactionId: string,
  over: Partial<typeof transactions.$inferInsert> = {},
) {
  await db.insert(transactions).values({
    transactionId,
    accountId: 'acc-1',
    itemId: 'itm-1',
    date: '2026-09-01',
    amount: '10',
    pending: false,
    plaidTransaction: { secret: 'raw-provider-payload' },
    ...over,
  });
}

beforeEach(async () => {
  await truncateAll();
  await seedItem('itm-1');
  await seedAccount('acc-1', 'itm-1');
  await seedAccount('acc-2', 'itm-1');
});

afterAll(async () => {
  await endPools();
});

describe('listTransactions', () => {
  it('joins category names per kind and leaves uncategorized rows null', async () => {
    const { categoryId } = await seedCardWithCategory();
    const creditId = await seedCreditCategory();
    await insertTxn('t-card', { cardCategoryId: categoryId, rewardRate: '6' });
    await insertTxn('t-credit', { amount: '-20', creditCategoryId: creditId });
    await insertTxn('t-none');

    const { transactions: rows, total } = await listTransactions('acc-1', 10, 0);
    expect(total).toBe(3);
    const byId = new Map(rows.map((row) => [row.transactionId, row]));
    expect(byId.get('t-card')).toMatchObject({
      cardCategoryName: 'Groceries',
      creditCategoryName: null,
    });
    expect(byId.get('t-credit')).toMatchObject({
      cardCategoryName: null,
      creditCategoryName: 'Refund',
    });
    expect(byId.get('t-none')).toMatchObject({
      cardCategoryName: null,
      creditCategoryName: null,
    });
    // The raw provider payload never rides the served projection.
    expect(rows[0]).not.toHaveProperty('plaidTransaction');
  });

  it('orders by date desc, then id desc as the same-date tiebreak', async () => {
    await insertTxn('older', { date: '2026-08-30' });
    await insertTxn('same-day-first', { date: '2026-09-01' });
    await insertTxn('same-day-second', { date: '2026-09-01' });
    await insertTxn('newest', { date: '2026-09-02' });

    const { transactions: rows } = await listTransactions('acc-1', 10, 0);
    expect(rows.map((row) => row.transactionId)).toEqual([
      'newest',
      'same-day-second',
      'same-day-first',
      'older',
    ]);
  });

  it('pages with limit/offset while total stays the full count', async () => {
    for (let i = 0; i < 5; i++) {
      await insertTxn(`t-${i}`, { date: `2026-09-0${i + 1}` });
    }

    const first = await listTransactions('acc-1', 2, 0);
    expect(first.total).toBe(5);
    expect(first.transactions.map((row) => row.transactionId)).toEqual(['t-4', 't-3']);

    const last = await listTransactions('acc-1', 2, 4);
    expect(last.transactions.map((row) => row.transactionId)).toEqual(['t-0']);

    const past = await listTransactions('acc-1', 2, 10);
    expect(past.transactions).toEqual([]);
    expect(past.total).toBe(5);
  });

  it('scopes rows and total to the requested account only', async () => {
    await insertTxn('mine');
    await insertTxn('theirs', { accountId: 'acc-2' });

    const { transactions: rows, total } = await listTransactions('acc-1', 10, 0);
    expect(rows.map((row) => row.transactionId)).toEqual(['mine']);
    expect(total).toBe(1);
  });
});
