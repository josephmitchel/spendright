import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { accounts } from '@/db/schema';
import { db, pool } from '@/lib/db';
import { getAccounts, syncTransactions } from '@/lib/plaid';
import type { ProviderAccount, ProviderSyncBatch } from '@/lib/provider-types';
import { syncItem } from '@/lib/sync';
import {
  itemRow,
  providerTxn,
  seedAccount,
  seedCardWithCategory,
  seedItem,
  transactionRow,
  truncateAll,
} from '../../test/db-fixtures';

vi.mock('@/lib/plaid', () => ({ getAccounts: vi.fn(), syncTransactions: vi.fn() }));
const mockSync = vi.mocked(syncTransactions);
const mockAccounts = vi.mocked(getAccounts);

const batch = (over: Partial<ProviderSyncBatch> = {}): ProviderSyncBatch => ({
  added: [],
  modified: [],
  removed: [],
  cursor: 'c-next',
  ...over,
});

const providerAccount = (over: Partial<ProviderAccount> = {}): ProviderAccount => ({
  accountId: 'acc-1',
  name: 'Blue Cash Preferred®',
  officialName: null,
  mask: null,
  type: 'credit',
  subtype: null,
  balanceAvailable: 100,
  balanceCurrent: 50,
  balanceLimit: null,
  isoCurrencyCode: 'USD',
  unofficialCurrencyCode: null,
  ...over,
});

beforeEach(async () => {
  mockSync.mockReset();
  mockAccounts.mockReset();
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

describe('a clean sync', () => {
  it('inserts the batch, advances the cursor, and clears item state', async () => {
    await seedItem('itm-err', { skippedSyncs: 2, error: { message: 'stale' } });
    await seedAccount('acc-err', 'itm-err');
    mockSync.mockResolvedValue(
      batch({ added: [providerTxn('t1', { accountId: 'acc-err' })], cursor: 'c1' }),
    );

    const result = await syncItem('itm-err', { accountsAlreadyStored: true });
    expect(result).toMatchObject({ added: 1, skipped: 0, dropped: false });

    expect((await transactionRow('t1'))?.amount).toBe('4.5');
    const item = await itemRow('itm-err');
    expect(item.cursor).toBe('c1');
    expect(item.skippedSyncs).toBe(0);
    expect(item.error).toBeNull();
  });

  it('deletes removed transactions', async () => {
    mockSync.mockResolvedValueOnce(batch({ added: [providerTxn('t1')] }));
    await syncItem('itm-1', { accountsAlreadyStored: true });

    mockSync.mockResolvedValueOnce(batch({ removed: [{ transactionId: 't1' }], cursor: 'c2' }));
    const result = await syncItem('itm-1', { accountsAlreadyStored: true });
    expect(result.removed).toBe(1);
    expect(await transactionRow('t1')).toBeUndefined();
  });

  it('throws when the item row does not exist', async () => {
    await expect(syncItem('itm-missing', { accountsAlreadyStored: true })).rejects.toThrow(
      'item row not found',
    );
  });
});

describe('unknown-account rows', () => {
  it('holds the cursor, stores the rest of the batch, and records the held error', async () => {
    mockSync.mockResolvedValue(
      batch({
        added: [providerTxn('t1'), providerTxn('t2', { accountId: 'acc-unknown' })],
        cursor: 'c-new',
      }),
    );

    const result = await syncItem('itm-1', { accountsAlreadyStored: true });
    expect(result).toMatchObject({ skipped: 1, dropped: false });

    expect(await transactionRow('t1')).toBeDefined();
    expect(await transactionRow('t2')).toBeUndefined();
    const item = await itemRow('itm-1');
    expect(item.cursor).toBe('c0');
    expect(item.skippedSyncs).toBe(1);
    expect((item.error as { message: string }).message).toContain('held and re-offered');
    expect((item.error as { message: string }).message).toContain('(1 of 5)');
  });

  it('drops the rows and advances the cursor on the 5th consecutive skip', async () => {
    await seedItem('itm-4', { cursor: 'c0', skippedSyncs: 4 });
    mockSync.mockResolvedValue(
      batch({ added: [providerTxn('t9', { accountId: 'acc-unknown' })], cursor: 'c-new' }),
    );

    const result = await syncItem('itm-4', { accountsAlreadyStored: true });
    expect(result).toMatchObject({ skipped: 1, dropped: true });

    expect(await transactionRow('t9')).toBeUndefined();
    const item = await itemRow('itm-4');
    expect(item.cursor).toBe('c-new');
    expect(item.skippedSyncs).toBe(0);
    expect((item.error as { message: string }).message).toContain('dropped');
  });
});

describe('the account refresh', () => {
  it('stores fetched accounts and re-matches the card on every sync', async () => {
    const { cardId } = await seedCardWithCategory();
    mockAccounts.mockResolvedValue([providerAccount()]);
    mockSync.mockResolvedValue(batch());

    await syncItem('itm-1');
    let [account] = await db.select().from(accounts).where(eq(accounts.accountId, 'acc-1'));
    expect(account?.cardId).toBe(cardId);
    expect(account?.balanceCurrent).toBe('50');

    // A provider-side rename unmatches unconditionally — no keep-existing branch.
    mockAccounts.mockResolvedValue([providerAccount({ name: 'Renamed Product' })]);
    await syncItem('itm-1');
    [account] = await db.select().from(accounts).where(eq(accounts.accountId, 'acc-1'));
    expect(account?.cardId).toBeNull();
  });

  it('records a refresh failure on the item but still syncs transactions', async () => {
    mockAccounts.mockRejectedValue(new Error('plaid unreachable'));
    mockSync.mockResolvedValue(batch({ added: [providerTxn('t1')], cursor: 'c1' }));

    const result = await syncItem('itm-1');
    expect(result.accountRefreshFailed).toBe(true);
    expect(await transactionRow('t1')).toBeDefined();

    const item = await itemRow('itm-1');
    expect(item.cursor).toBe('c1');
    expect((item.error as { message: string }).message).toContain('account refresh failed');
  });

  it('lets a held/dropped message win over the refresh-failure message', async () => {
    mockAccounts.mockRejectedValue(new Error('plaid unreachable'));
    mockSync.mockResolvedValue(batch({ added: [providerTxn('t1', { accountId: 'acc-unknown' })] }));

    const result = await syncItem('itm-1');
    expect(result.accountRefreshFailed).toBe(true);
    expect(((await itemRow('itm-1')).error as { message: string }).message).toContain(
      'held and re-offered',
    );
  });
});
