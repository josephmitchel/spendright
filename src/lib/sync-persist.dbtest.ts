import { count, eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cardCategories, transactions } from '@/db/schema';
import { db, pool } from '@/lib/db';
import { syncTransactions } from '@/lib/plaid';
import type { ProviderSyncBatch } from '@/lib/provider-types';
import { syncItem } from '@/lib/sync';
import {
  endPools,
  providerTxn,
  seedAccount,
  seedCardWithCategory,
  seedCreditCategory,
  seedItem,
  transactionRow,
  truncateAll,
} from '../../test/db-fixtures';

vi.mock('@/lib/plaid', () => ({ getAccounts: vi.fn(), syncTransactions: vi.fn() }));
const mockSync = vi.mocked(syncTransactions);

const batch = (over: Partial<ProviderSyncBatch> = {}): ProviderSyncBatch => ({
  added: [],
  modified: [],
  removed: [],
  cursor: 'c-next',
  incomplete: false,
  ...over,
});

const sync = () => syncItem('itm-1', { accountsAlreadyStored: true });

async function seedPendingRow(over: Partial<typeof transactions.$inferInsert> = {}) {
  await db.insert(transactions).values({
    transactionId: 'pend-1',
    accountId: 'acc-1',
    itemId: 'itm-1',
    date: '2026-09-01',
    amount: '10',
    pending: true,
    plaidTransaction: {},
    ...over,
  });
}

beforeEach(async () => {
  mockSync.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  await truncateAll();
  await seedItem('itm-1', { cursor: 'c0' });
  await seedAccount('acc-1', 'itm-1');
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await endPools();
});

// Positive signal that the sync transaction is blocked on the held row lock,
// instead of a wall-clock sleep.
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

describe('bulk upserts', () => {
  it('chunks batches past the bind-parameter cap (600 rows in one sync)', async () => {
    const added = Array.from({ length: 600 }, (_, i) => providerTxn(`bulk-${i}`));
    mockSync.mockResolvedValue(batch({ added }));

    const result = await sync();
    expect(result.added).toBe(600);
    const [row] = await db.select({ n: count() }).from(transactions);
    expect(row?.n).toBe(600);
  });

  it('dedupes a transactionId repeated within one batch, last entry winning', async () => {
    // Postgres rejects one statement updating the same row twice; the comment
    // in batchRows promises deduped last-wins instead of that error.
    mockSync.mockResolvedValue(
      batch({
        added: [
          providerTxn('dup-1', { amount: 4.5, name: 'FIRST' }),
          providerTxn('dup-1', { amount: 9.75, name: 'SECOND' }),
        ],
      }),
    );
    const result = await sync();
    expect(result.added).toBe(2);

    const row = await transactionRow('dup-1');
    expect(row?.name).toBe('SECOND');
    expect(row?.amount).toBe('9.75');
    const [n] = await db.select({ n: count() }).from(transactions);
    expect(n?.n).toBe(1);
  });

  it('keeps user selections on re-synced rows while updating base columns', async () => {
    const { categoryId } = await seedCardWithCategory();
    mockSync.mockResolvedValueOnce(batch({ added: [providerTxn('t1')] }));
    await sync();
    await db
      .update(transactions)
      .set({ cardCategoryId: categoryId, rewardRate: '6' })
      .where(eq(transactions.transactionId, 't1'));

    mockSync.mockResolvedValueOnce(
      batch({ modified: [providerTxn('t1', { name: 'COFFEE — UPDATED' })], cursor: 'c2' }),
    );
    await sync();

    const row = await transactionRow('t1');
    expect(row?.name).toBe('COFFEE — UPDATED');
    expect(row?.cardCategoryId).toBe(categoryId);
    expect(row?.rewardRate).toBe('6');
  });

  it('clears the now-wrong-kind selection when an amount flips sign', async () => {
    const { categoryId } = await seedCardWithCategory();
    mockSync.mockResolvedValueOnce(batch({ added: [providerTxn('t1', { amount: 20 })] }));
    await sync();
    await db
      .update(transactions)
      .set({ cardCategoryId: categoryId, rewardRate: '6' })
      .where(eq(transactions.transactionId, 't1'));

    mockSync.mockResolvedValueOnce(
      batch({ modified: [providerTxn('t1', { amount: -20 })], cursor: 'c2' }),
    );
    await sync();

    const row = await transactionRow('t1');
    expect(row?.amount).toBe('-20');
    expect(row?.cardCategoryId).toBeNull();
    expect(row?.rewardRate).toBeNull();
  });
});

describe('pending→posted carry', () => {
  it('carries card category and rate to the posted row and deletes the pending row', async () => {
    const { categoryId } = await seedCardWithCategory();
    await seedPendingRow({ cardCategoryId: categoryId, rewardRate: '6' });

    mockSync.mockResolvedValue(
      batch({
        added: [providerTxn('post-1', { amount: 10, pendingTransactionId: 'pend-1' })],
        removed: [{ transactionId: 'pend-1' }],
      }),
    );
    await sync();

    const posted = await transactionRow('post-1');
    expect(posted?.cardCategoryId).toBe(categoryId);
    expect(posted?.rewardRate).toBe('6');
    expect(await transactionRow('pend-1')).toBeUndefined();
  });

  it('carries the rate snapshot alone when the category row no longer exists', async () => {
    const { categoryId } = await seedCardWithCategory();
    await seedPendingRow({ cardCategoryId: categoryId, rewardRate: '6' });
    // A hand delete: the FK set-null clears the link, the snapshot rate stays.
    await db.delete(cardCategories).where(eq(cardCategories.id, categoryId));

    mockSync.mockResolvedValue(
      batch({
        added: [providerTxn('post-1', { amount: 10, pendingTransactionId: 'pend-1' })],
        removed: [{ transactionId: 'pend-1' }],
      }),
    );
    await sync();

    const posted = await transactionRow('post-1');
    expect(posted?.cardCategoryId).toBeNull();
    expect(posted?.rewardRate).toBe('6');
  });

  it('carries a selection committed by a concurrent PATCH instead of losing it', async () => {
    const { categoryId } = await seedCardWithCategory();
    await seedPendingRow();

    // A PATCH transaction holds the pending row's lock; the carry read must
    // wait for its commit and pick up the selection it wrote.
    const patchClient = await pool.connect();
    try {
      await patchClient.query('begin');
      await patchClient.query(
        "select * from spendright.transactions where transaction_id = 'pend-1' for update",
      );

      mockSync.mockResolvedValue(
        batch({
          added: [providerTxn('post-1', { amount: 10, pendingTransactionId: 'pend-1' })],
          removed: [{ transactionId: 'pend-1' }],
        }),
      );
      const syncing = sync();
      await waitForLockWaiter();
      await patchClient.query(
        "update spendright.transactions set card_category_id = $1, reward_rate = '6' " +
          "where transaction_id = 'pend-1'",
        [categoryId],
      );
      await patchClient.query('commit');
      await syncing;
    } finally {
      patchClient.release();
    }

    const posted = await transactionRow('post-1');
    expect(posted?.cardCategoryId).toBe(categoryId);
    expect(posted?.rewardRate).toBe('6');
    expect(await transactionRow('pend-1')).toBeUndefined();
  });

  it('carries a credit category onto a posted inflow', async () => {
    const creditId = await seedCreditCategory();
    await seedPendingRow({ amount: '-15', creditCategoryId: creditId });

    mockSync.mockResolvedValue(
      batch({
        added: [providerTxn('post-1', { amount: -15, pendingTransactionId: 'pend-1' })],
        removed: [{ transactionId: 'pend-1' }],
      }),
    );
    await sync();

    expect((await transactionRow('post-1'))?.creditCategoryId).toBe(creditId);
  });
});
