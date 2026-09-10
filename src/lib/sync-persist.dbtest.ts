import { count, eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cardCategories, transactions } from '@/db/schema';
import { db, pool } from '@/lib/db';
import { syncTransactions } from '@/lib/plaid';
import type { ProviderSyncBatch } from '@/lib/provider-types';
import { syncItem } from '@/lib/sync';
import {
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
  await pool.end();
});

describe('bulk upserts', () => {
  it('chunks batches past the bind-parameter cap (600 rows in one sync)', async () => {
    const added = Array.from({ length: 600 }, (_, i) => providerTxn(`bulk-${i}`));
    mockSync.mockResolvedValue(batch({ added }));

    const result = await sync();
    expect(result.added).toBe(600);
    const [row] = await db.select({ n: count() }).from(transactions);
    expect(row?.n).toBe(600);
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
