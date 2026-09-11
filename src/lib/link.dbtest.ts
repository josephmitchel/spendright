import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { accounts } from '@/db/schema';
import { decrypt } from '@/lib/crypto';
import { db } from '@/lib/db';
import { linkItem } from '@/lib/link';
import {
  exchangePublicToken,
  getAccounts,
  getInstitutionById,
  getItem,
  removeItem,
  syncTransactions,
} from '@/lib/plaid';
import { endPools, itemRow, providerAccount, seedItem, truncateAll } from '../../test/db-fixtures';

vi.mock('@/lib/plaid', () => ({
  createLinkToken: vi.fn(),
  exchangePublicToken: vi.fn(),
  getAccounts: vi.fn(),
  getInstitutionById: vi.fn(),
  getItem: vi.fn(),
  removeItem: vi.fn(),
  syncTransactions: vi.fn(),
}));
const mockExchange = vi.mocked(exchangePublicToken);
const mockGetItem = vi.mocked(getItem);
const mockGetAccounts = vi.mocked(getAccounts);
const mockGetInstitution = vi.mocked(getInstitutionById);
const mockSync = vi.mocked(syncTransactions);
const mockRemoveItem = vi.mocked(removeItem);

const emptyBatch = { added: [], modified: [], removed: [], cursor: 'c-initial', incomplete: false };

function mockHappyPlaid(itemId: string) {
  mockExchange.mockResolvedValue({ accessToken: `tok-${itemId}`, itemId });
  mockGetItem.mockResolvedValue({ institutionId: 'ins-1', institutionName: 'Plaid Name' });
  mockGetInstitution.mockResolvedValue({ name: 'Real Bank', logo: null, primaryColor: '#3a3' });
  mockGetAccounts.mockResolvedValue([providerAccount('acc-new')]);
  mockSync.mockResolvedValue(emptyBatch);
}

beforeEach(async () => {
  vi.resetAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  await truncateAll();
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await endPools();
});

describe('linkItem', () => {
  it('stores the item, its accounts, and runs the initial sync', async () => {
    mockHappyPlaid('itm-new');

    const result = await linkItem('public-token');
    expect(result).toMatchObject({
      itemId: 'itm-new',
      institutionName: 'Real Bank',
      accountsStored: 1,
      setupFailed: false,
      syncError: null,
      accountErrors: [],
    });
    expect(result.sync).toMatchObject({ itemId: 'itm-new' });

    const item = await itemRow('itm-new');
    expect(decrypt(item.accessToken)).toBe('tok-itm-new');
    expect(item).toMatchObject({
      institutionName: 'Real Bank',
      institutionPrimaryColor: '#3a3',
      cursor: 'c-initial',
      error: null,
    });
    const [account] = await db.select().from(accounts).where(eq(accounts.accountId, 'acc-new'));
    expect(account).toMatchObject({ itemId: 'itm-new', balanceCurrent: '250.5' });
  });

  it('records a durable item error when enrichment fails, keeping the shell row', async () => {
    mockExchange.mockResolvedValue({ accessToken: 'tok-2', itemId: 'itm-fail' });
    mockGetItem.mockRejectedValue(new Error('plaid down'));
    mockGetAccounts.mockResolvedValue([]);

    const result = await linkItem('public-token');
    expect(result).toMatchObject({
      itemId: 'itm-fail',
      setupFailed: true,
      sync: null,
      accountErrors: [],
      syncError:
        'Linking finished but account setup failed — sync again, or remove the institution',
    });

    const item = await itemRow('itm-fail');
    expect(decrypt(item.accessToken)).toBe('tok-2');
    expect(item.error).toEqual({
      message: 'Linking finished but account setup failed — sync again, or remove the institution',
    });
  });

  it('never nulls previously stored institution metadata on a failed metadata fetch', async () => {
    await seedItem('itm-old', {
      institutionId: 'ins-0',
      institutionName: 'Old Bank',
      institutionLogo: 'logo-bytes',
      institutionPrimaryColor: '#000',
    });
    mockExchange.mockResolvedValue({ accessToken: 'tok-relink', itemId: 'itm-old' });
    // The item fetch succeeds but names nothing; the institution lookup fails.
    mockGetItem.mockResolvedValue({ institutionId: 'ins-0', institutionName: null });
    mockGetInstitution.mockRejectedValue(new Error('institution lookup down'));
    mockGetAccounts.mockResolvedValue([providerAccount('acc-old')]);
    mockSync.mockResolvedValue(emptyBatch);

    const result = await linkItem('public-token');
    expect(result.setupFailed).toBe(false);
    expect(result.institutionName).toBe('Old Bank');

    const item = await itemRow('itm-old');
    expect(item).toMatchObject({
      institutionName: 'Old Bank',
      institutionLogo: 'logo-bytes',
      institutionPrimaryColor: '#000',
    });
    expect(decrypt(item.accessToken)).toBe('tok-relink');
  });

  it('surfaces a per-account store failure without losing the other accounts', async () => {
    mockHappyPlaid('itm-mixed');
    mockGetAccounts.mockResolvedValue([
      providerAccount('acc-ok'),
      // A provider row missing its id violates accounts.account_id NOT NULL,
      // so this account's own transaction fails while the link continues.
      providerAccount('acc-bad', { name: 'Bad Card', accountId: null as unknown as string }),
    ]);

    const result = await linkItem('public-token');
    expect(result.accountsStored).toBe(1);
    expect(result.accountErrors).toHaveLength(1);
    expect(result.accountErrors[0]).toMatch(/^Bad Card: /);
    expect(result.setupFailed).toBe(false);

    const stored = await db.select().from(accounts);
    expect(stored.map((row) => row.accountId)).toEqual(['acc-ok']);
  });

  it('reports an initial-sync failure distinctly and records it on the item', async () => {
    mockHappyPlaid('itm-syncfail');
    mockSync.mockRejectedValue(new Error('sync exploded'));

    const result = await linkItem('public-token');
    expect(result).toMatchObject({
      setupFailed: false,
      sync: null,
      syncError: 'The first sync failed — use Sync all on the home page to retry',
      accountsStored: 1,
    });
    expect((await itemRow('itm-syncfail')).error).toEqual({
      message: 'The first sync failed — use Sync all on the home page to retry',
    });
  });

  it('revokes the just-created Plaid item when storing it fails', async () => {
    mockHappyPlaid('itm-orphan');
    // A null itemId violates items.item_id NOT NULL, failing the shell insert
    // right after the exchange created a live Item at Plaid.
    mockExchange.mockResolvedValue({
      accessToken: 'tok-orphan',
      itemId: null as unknown as string,
    });
    mockRemoveItem.mockResolvedValue('req-1');

    await expect(linkItem('public-token')).rejects.toThrow();
    expect(mockRemoveItem).toHaveBeenCalledWith('tok-orphan');
  });

  it('still surfaces the store failure when the compensating revoke also fails', async () => {
    mockHappyPlaid('itm-orphan');
    mockExchange.mockResolvedValue({
      accessToken: 'tok-orphan',
      itemId: null as unknown as string,
    });
    mockRemoveItem.mockRejectedValue(new Error('plaid down'));

    // The original persistence failure wins, not the revoke failure.
    await expect(linkItem('public-token')).rejects.toThrow();
    expect(mockRemoveItem).toHaveBeenCalledWith('tok-orphan');
  });
});
