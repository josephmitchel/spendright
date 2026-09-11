import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicError } from '@/lib/public-error';
import { syncItem, type SyncItemResult } from '@/lib/sync';
import { syncAllItems } from '@/lib/sync-all';
import { endPools, itemRow, seedItem, truncateAll } from '../../test/db-fixtures';

vi.mock('@/lib/sync', () => ({ syncItem: vi.fn() }));
const mockSyncItem = vi.mocked(syncItem);

const syncResult = (itemId: string): SyncItemResult => ({
  itemId,
  institutionName: 'Test Bank',
  added: 1,
  modified: 0,
  removed: 0,
  skipped: 0,
  dropped: false,
  accountRefreshFailed: false,
  incomplete: false,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function waitFor(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('condition not met in time');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

beforeEach(async () => {
  mockSyncItem.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  await truncateAll();
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await endPools();
});

describe('syncAllItems', () => {
  it('keeps results aligned with call order when items finish out of order', async () => {
    await seedItem('itm-1');
    await seedItem('itm-2');
    await seedItem('itm-3');
    const slots = new Map<string, ReturnType<typeof deferred<SyncItemResult>>>();
    mockSyncItem.mockImplementation((itemId) => {
      const slot = deferred<SyncItemResult>();
      slots.set(itemId, slot);
      return slot.promise;
    });

    const run = syncAllItems('manual');
    await waitFor(() => slots.size === 3);
    const callOrder = mockSyncItem.mock.calls.map(([itemId]) => itemId);
    // Resolve in reverse call order; results must still land by call index.
    for (const itemId of [...callOrder].reverse()) {
      slots.get(itemId)?.resolve(syncResult(itemId));
    }

    const results = await run;
    expect(results.map((result) => result.itemId)).toEqual(callOrder);
    expect(results.every((result) => 'added' in result)).toBe(true);
  });

  it("isolates one item's failure and records it on that item row", async () => {
    await seedItem('itm-1');
    await seedItem('itm-2');
    await seedItem('itm-3');
    mockSyncItem.mockImplementation(async (itemId) => {
      if (itemId === 'itm-2') throw new Error('boom — select secret_sql from items');
      if (itemId === 'itm-3') {
        throw new PublicError('Bank maintenance window', { status: 502, code: 'PLAID' });
      }
      return syncResult(itemId);
    });

    const results = await syncAllItems('manual');
    expect(results).toHaveLength(3);
    const byId = new Map(results.map((result) => [result.itemId, result]));
    expect(byId.get('itm-1')).toMatchObject({ added: 1 });
    expect(byId.get('itm-2')).toEqual({
      itemId: 'itm-2',
      institutionName: 'Test Bank',
      error: 'Sync failed — try Sync all again in a moment',
    });
    // A raw error message (which may carry SQL) never reaches the result.
    expect(JSON.stringify(results)).not.toContain('secret_sql');
    expect(byId.get('itm-3')).toMatchObject({ error: 'Bank maintenance window' });

    expect((await itemRow('itm-2')).error).toEqual({
      message: 'Sync failed — try Sync all again in a moment',
    });
    expect((await itemRow('itm-3')).error).toEqual({ message: 'Bank maintenance window' });
    expect((await itemRow('itm-1')).error).toBeNull();
  });

  it('runs every item while never exceeding the concurrency bound', async () => {
    for (let i = 1; i <= 5; i++) await seedItem(`itm-${i}`);
    let active = 0;
    let maxActive = 0;
    mockSyncItem.mockImplementation(async (itemId) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 20));
      active -= 1;
      return syncResult(itemId);
    });

    const results = await syncAllItems('manual');
    expect(results).toHaveLength(5);
    expect(mockSyncItem).toHaveBeenCalledTimes(5);
    expect(maxActive).toBeLessThanOrEqual(3);
    expect(maxActive).toBeGreaterThan(1);
  });

  it('joins overlapping calls into a single run', async () => {
    await seedItem('itm-1');
    const slot = deferred<SyncItemResult>();
    mockSyncItem.mockReturnValue(slot.promise);

    const first = syncAllItems('manual');
    const second = syncAllItems('scheduled');
    slot.resolve(syncResult('itm-1'));
    const [firstResults, secondResults] = await Promise.all([first, second]);
    expect(secondResults).toBe(firstResults);
    expect(mockSyncItem).toHaveBeenCalledTimes(1);

    // Once the joined run settles, a new call starts a fresh run.
    mockSyncItem.mockResolvedValue(syncResult('itm-1'));
    await syncAllItems('manual');
    expect(mockSyncItem).toHaveBeenCalledTimes(2);
  });
});
