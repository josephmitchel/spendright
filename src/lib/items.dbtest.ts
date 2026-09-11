import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { accounts, items } from '@/db/schema';
import { db } from '@/lib/db';
import { removeItemCompletely } from '@/lib/items';
import { removeItem } from '@/lib/plaid';
import { endPools, seedAccount, seedItem, truncateAll } from '../../test/db-fixtures';

vi.mock('@/lib/plaid', () => ({ removeItem: vi.fn() }));
const mockRemove = vi.mocked(removeItem);

async function itemExists(itemId: string): Promise<boolean> {
  const rows = await db.select().from(items).where(eq(items.itemId, itemId));
  return rows.length > 0;
}

beforeEach(async () => {
  mockRemove.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  await truncateAll();
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await endPools();
});

describe('removeItemCompletely', () => {
  it('returns false for an unknown item without calling Plaid', async () => {
    expect(await removeItemCompletely('itm-missing')).toBe(false);
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('revokes at Plaid with the decrypted token, then deletes with cascade', async () => {
    await seedItem('itm-1');
    await seedAccount('acc-1', 'itm-1');
    mockRemove.mockResolvedValue('req-1');

    expect(await removeItemCompletely('itm-1')).toBe(true);
    // db-fixtures seeds accessToken as encrypt(`token-${itemId}`).
    expect(mockRemove).toHaveBeenCalledExactlyOnceWith('token-itm-1');
    expect(await itemExists('itm-1')).toBe(false);
    expect(await db.select().from(accounts)).toHaveLength(0);
  });

  it('skips the Plaid revoke when the stored token is unreadable, but still deletes', async () => {
    await seedItem('itm-1', { accessToken: 'not-ciphertext' });

    expect(await removeItemCompletely('itm-1')).toBe(true);
    expect(mockRemove).not.toHaveBeenCalled();
    expect(await itemExists('itm-1')).toBe(false);
  });

  it('swallows ITEM_NOT_FOUND from Plaid — the grant is already gone', async () => {
    await seedItem('itm-1');
    mockRemove.mockRejectedValue({ response: { data: { error_code: 'ITEM_NOT_FOUND' } } });

    expect(await removeItemCompletely('itm-1')).toBe(true);
    expect(await itemExists('itm-1')).toBe(false);
  });

  it('aborts the delete on any other Plaid failure so the live grant is never orphaned', async () => {
    await seedItem('itm-1');
    mockRemove.mockRejectedValue({
      response: { data: { error_code: 'INSTITUTION_DOWN', error_message: 'down' } },
    });

    await expect(removeItemCompletely('itm-1')).rejects.toMatchObject({
      response: { data: { error_code: 'INSTITUTION_DOWN' } },
    });
    expect(await itemExists('itm-1')).toBe(true);
  });

  it('aborts the delete on a network failure talking to Plaid', async () => {
    await seedItem('itm-1');
    mockRemove.mockRejectedValue(new Error('socket hang up'));

    await expect(removeItemCompletely('itm-1')).rejects.toThrow('socket hang up');
    expect(await itemExists('itm-1')).toBe(true);
  });
});
