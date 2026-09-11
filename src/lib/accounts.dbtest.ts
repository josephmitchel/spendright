import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { accounts, cards } from '@/db/schema';
import { refreshItemAccounts } from '@/lib/accounts';
import { db } from '@/lib/db';
import {
  endPools,
  providerAccount,
  seedCardWithCategory,
  seedItem,
  truncateAll,
} from '../../test/db-fixtures';

async function accountRow(accountId: string) {
  const [row] = await db.select().from(accounts).where(eq(accounts.accountId, accountId));
  return row;
}

let cardId: number;

beforeEach(async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  await truncateAll();
  await seedItem('itm-1');
  ({ cardId } = await seedCardWithCategory());
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await endPools();
});

describe('refreshItemAccounts', () => {
  it('stores an account and matches its card name case/whitespace-insensitively', async () => {
    const failures = await refreshItemAccounts('itm-1', [
      providerAccount('acc-1', { name: '  blue cash preferred®' }),
    ]);
    expect(failures).toEqual([]);
    expect(await accountRow('acc-1')).toMatchObject({
      itemId: 'itm-1',
      cardId,
      balanceCurrent: '250.5',
      balanceLimit: '5000',
    });
  });

  it('stores an unrecognized account with no card match', async () => {
    await refreshItemAccounts('itm-1', [providerAccount('acc-2', { name: 'Mystery Card' })]);
    expect(await accountRow('acc-2')).toMatchObject({ cardId: null });
  });

  it('does not match a retired card', async () => {
    await db.update(cards).set({ retiredAt: new Date() }).where(eq(cards.id, cardId));
    await refreshItemAccounts('itm-1', [providerAccount('acc-3')]);
    expect(await accountRow('acc-3')).toMatchObject({ cardId: null });
  });

  it('isolates a failing account to its own rows', async () => {
    const failures = await refreshItemAccounts('itm-1', [
      providerAccount('acc-ok'),
      // A provider row missing its id violates accounts.account_id NOT NULL,
      // failing this account's dedicated transaction.
      providerAccount('acc-bad', { accountId: null as unknown as string }),
    ]);
    expect(failures).toHaveLength(1);
    expect(failures[0]?.account.accountId).toBeNull();
    expect(await accountRow('acc-ok')).toBeDefined();
    expect(await accountRow('acc-bad')).toBeUndefined();
  });

  it('keeps an existing card link when the account name stops matching anything', async () => {
    await refreshItemAccounts('itm-1', [providerAccount('acc-1')]);
    await refreshItemAccounts('itm-1', [
      providerAccount('acc-1', { name: 'Renamed At The Bank', officialName: null }),
    ]);
    expect(await accountRow('acc-1')).toMatchObject({ cardId, name: 'Renamed At The Bank' });
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('no longer matches'));
  });

  it('falls back to officialName when the display name is unrecognized', async () => {
    await refreshItemAccounts('itm-1', [
      providerAccount('acc-official', { name: 'My Nickname', officialName: 'Blue Cash Preferred' }),
    ]);
    expect(await accountRow('acc-official')).toMatchObject({ cardId });
  });

  it('updates balances and keeps the card match on a re-refresh', async () => {
    await refreshItemAccounts('itm-1', [providerAccount('acc-1')]);
    await refreshItemAccounts('itm-1', [
      providerAccount('acc-1', { balanceCurrent: 300, balanceAvailable: null }),
    ]);
    expect(await accountRow('acc-1')).toMatchObject({
      cardId,
      balanceCurrent: '300',
      balanceAvailable: null,
    });
  });
});
