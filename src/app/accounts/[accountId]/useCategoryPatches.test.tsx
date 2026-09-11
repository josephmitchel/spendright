import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiCard, ApiTransaction, TransactionPatchResponse } from '@/lib/api-types';
import { sendJson } from '@/lib/http';
import type * as HttpModule from '@/lib/http';
import { categoryFields, type CategoryPatch } from './category-patch';
import { CategoryWriteState } from './category-write-state';
import { useCategoryPatches } from './useCategoryPatches';

vi.mock('@/lib/http', async (importActual) => {
  const actual = await importActual<typeof HttpModule>();
  return { ...actual, sendJson: vi.fn() };
});
const mockSend = vi.mocked(sendJson);

const txn = (over: Partial<ApiTransaction> = {}): ApiTransaction => ({
  id: 1,
  transactionId: 'txn-1',
  accountId: 'acc-1',
  itemId: 'itm-1',
  date: '2026-09-01',
  name: 'GROCERY STORE',
  merchantName: null,
  amount: '25',
  isoCurrencyCode: 'USD',
  unofficialCurrencyCode: null,
  category: null,
  pending: false,
  cardCategoryId: null,
  rewardRate: null,
  creditCategoryId: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  cardCategoryName: null,
  creditCategoryName: null,
  ...over,
});

const category = (id: number, name: string, rate: string) => ({
  id,
  cardId: 1,
  name,
  rate,
  annualCapAmount: null,
  postCapRate: null,
  retiredAt: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
});

const card: ApiCard = {
  id: 1,
  slug: 'amex-bcp',
  name: 'Blue Cash Preferred',
  issuer: null,
  type: 'cashback',
  plaidAccountNames: ['Blue Cash Preferred®'],
  ratesVerifiedOn: '2026-09-07',
  ratesVerifiedSource: 'issuer terms',
  retiredAt: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  categories: [category(10, 'Groceries', '6'), category(11, 'Gas', '3')],
};

interface PendingPatch {
  resolve: (response: TransactionPatchResponse) => void;
  reject: (err: unknown) => void;
}

function setup() {
  const pending: PendingPatch[] = [];
  mockSend.mockImplementation(
    () =>
      new Promise((resolve, reject) => {
        pending.push({ resolve: resolve as PendingPatch['resolve'], reject });
      }) as never,
  );
  const writeState = new CategoryWriteState();
  const applied: Array<{ transactionId: string; fields: CategoryPatch }> = [];
  const apply = (transactionId: string, fields: CategoryPatch) => {
    applied.push({ transactionId, fields });
  };
  const hook = renderHook(() => useCategoryPatches(card, [], apply, writeState));
  return { pending, writeState, applied, hook };
}

beforeEach(() => {
  mockSend.mockReset();
});

describe('useCategoryPatches with CategoryWriteState', () => {
  it('applies optimistically, then settles on the server row', async () => {
    const { pending, writeState, applied, hook } = setup();

    act(() => {
      void hook.result.current.setCategory(txn(), 'card', 10);
    });
    expect(applied[0]?.fields).toMatchObject({
      cardCategoryId: 10,
      cardCategoryName: 'Groceries',
      rewardRate: '6',
    });

    // The server's snapshot (a capped rate here) beats the optimistic guess.
    const serverRow = txn({ cardCategoryId: 10, cardCategoryName: 'Groceries', rewardRate: '1' });
    await waitFor(() => expect(pending).toHaveLength(1));
    await act(async () => pending[0]?.resolve({ transaction: serverRow }));
    await waitFor(() => expect(applied).toHaveLength(2));
    expect(applied[1]?.fields).toEqual(categoryFields(serverRow));
    expect(hook.result.current.patchErrors.size).toBe(0);

    // Settled: after release, a fetched row passes through unmodified.
    writeState.releaseSettledHolds();
    const incoming = [txn({ cardCategoryId: 10, rewardRate: '1' })];
    expect(writeState.fetchedRowMerger()(incoming, incoming)).toEqual(incoming);
  });

  it('holds a mid-burst fetch to the on-screen selection, last pick winning', async () => {
    const { pending, writeState, applied, hook } = setup();

    act(() => {
      void hook.result.current.setCategory(txn(), 'card', 10);
    });
    act(() => {
      void hook.result.current.setCategory(
        txn({ cardCategoryId: 10, cardCategoryName: 'Groceries', rewardRate: '6' }),
        'card',
        11,
      );
    });
    expect(applied[1]?.fields).toMatchObject({ cardCategoryId: 11, cardCategoryName: 'Gas' });

    // A poll lands mid-burst with a stale (uncategorized) server row: the
    // fetchedRowMerger→releaseSettledHolds protocol keeps the shown pick.
    const stale = [txn()];
    const shown = [txn({ cardCategoryId: 11, cardCategoryName: 'Gas', rewardRate: '3' })];
    const merged = writeState.fetchedRowMerger()(stale, shown);
    expect(merged[0]).toMatchObject({ cardCategoryId: 11, cardCategoryName: 'Gas' });
    writeState.releaseSettledHolds();

    // First PATCH settles: the burst is still open, so nothing applies yet.
    await waitFor(() => expect(pending).toHaveLength(1));
    await act(async () =>
      pending[0]?.resolve({
        transaction: txn({ cardCategoryId: 10, cardCategoryName: 'Groceries', rewardRate: '6' }),
      }),
    );
    expect(applied).toHaveLength(2);

    // The queued second PATCH sends and settles the burst on its server row.
    await waitFor(() => expect(pending).toHaveLength(2));
    const serverRow = txn({ cardCategoryId: 11, cardCategoryName: 'Gas', rewardRate: '3' });
    await act(async () => pending[1]?.resolve({ transaction: serverRow }));
    await waitFor(() => expect(applied).toHaveLength(3));
    expect(applied[2]?.fields).toEqual(categoryFields(serverRow));
    expect(hook.result.current.patchErrors.size).toBe(0);
  });

  it('rolls back to the pre-burst baseline and reports the row error on failure', async () => {
    const { pending, applied, hook } = setup();
    const baseline = txn();

    act(() => {
      void hook.result.current.setCategory(baseline, 'card', 10);
    });
    await waitFor(() => expect(pending).toHaveLength(1));
    await act(async () => pending[0]?.reject(new Error('category vanished')));

    await waitFor(() => expect(applied).toHaveLength(2));
    expect(applied[1]?.fields).toEqual(categoryFields(baseline));
    await waitFor(() =>
      expect(hook.result.current.patchErrors.get('txn-1')).toBe('category vanished'),
    );
  });
});
