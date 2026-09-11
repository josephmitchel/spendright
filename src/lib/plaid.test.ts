import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAccounts, isTransientPlaidFailure, retryDelayMs, syncTransactions } from '@/lib/plaid';
import { PublicError } from '@/lib/public-error';

type SyncRequest = { cursor?: string; count?: number };

const seam = vi.hoisted(() => ({
  syncResponses: [] as Array<() => unknown>,
  syncRequests: [] as Array<{ cursor?: string; count?: number }>,
  accountsResponses: [] as Array<() => unknown>,
  // Fake timers mock Date, so these timestamps measure the retry delays.
  accountsAttempts: [] as number[],
}));

vi.mock('plaid', () => {
  const take = (queue: Array<() => unknown>) => {
    const next = queue.shift();
    if (!next) throw new Error('test response queue exhausted');
    return Promise.resolve().then(next);
  };
  class PlaidApi {
    transactionsSync(req: SyncRequest) {
      seam.syncRequests.push({ cursor: req.cursor, count: req.count });
      return take(seam.syncResponses);
    }
    accountsGet() {
      seam.accountsAttempts.push(Date.now());
      return take(seam.accountsResponses);
    }
  }
  return {
    PlaidApi,
    Configuration: class {},
    PlaidEnvironments: { sandbox: 'https://sandbox.plaid.test' },
    Products: { Transactions: 'transactions' },
    CountryCode: { Us: 'US' },
  };
});

const axiosErr = (status?: number, headers: Record<string, unknown> = {}) => ({
  isAxiosError: true as const,
  ...(status === undefined ? {} : { response: { status, headers } }),
});

const acct = {
  account_id: 'acc-1',
  name: 'Blue Cash Preferred®',
  official_name: 'Blue Cash Preferred® Card',
  mask: '1005',
  type: 'credit',
  subtype: 'credit card',
  balances: {
    available: 100,
    current: 50,
    limit: 1000,
    iso_currency_code: 'USD',
    unofficial_currency_code: null,
  },
};

const accountsOk = () => ({ data: { accounts: [acct] } });

function plaidTxn(id: string, over: Record<string, unknown> = {}) {
  return {
    transaction_id: id,
    account_id: 'acc-1',
    date: '2026-09-01',
    name: 'COFFEE SHOP 42',
    merchant_name: 'Coffee Shop',
    amount: 4.5,
    iso_currency_code: 'USD',
    unofficial_currency_code: null,
    pending: false,
    pending_transaction_id: null,
    ...over,
  };
}

const page = (over: Record<string, unknown> = {}) => ({
  data: { added: [], modified: [], removed: [], next_cursor: 'c1', has_more: false, ...over },
});

beforeAll(() => {
  process.env.PLAID_CLIENT_ID = 'test-client-id';
  process.env.PLAID_SECRET = 'test-secret';
  delete process.env.PLAID_ENV;
});

beforeEach(() => {
  seam.syncResponses.length = 0;
  seam.syncRequests.length = 0;
  seam.accountsResponses.length = 0;
  seam.accountsAttempts.length = 0;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('isTransientPlaidFailure', () => {
  it('treats non-axios errors as permanent', () => {
    expect(isTransientPlaidFailure(new Error('boom'))).toBe(false);
    expect(isTransientPlaidFailure(undefined)).toBe(false);
  });

  it('treats a missing response, 5xx, and 429 as transient', () => {
    expect(isTransientPlaidFailure(axiosErr())).toBe(true);
    expect(isTransientPlaidFailure(axiosErr(500))).toBe(true);
    expect(isTransientPlaidFailure(axiosErr(503))).toBe(true);
    expect(isTransientPlaidFailure(axiosErr(429))).toBe(true);
  });

  it("treats any other 4xx as Plaid's real answer", () => {
    expect(isTransientPlaidFailure(axiosErr(400))).toBe(false);
    expect(isTransientPlaidFailure(axiosErr(404))).toBe(false);
  });
});

describe('retryDelayMs', () => {
  it('defaults to 1s without a usable Retry-After', () => {
    expect(retryDelayMs(axiosErr(500))).toBe(1000);
    expect(retryDelayMs(axiosErr(429, { 'retry-after': 'soon' }))).toBe(1000);
    expect(retryDelayMs(axiosErr(429, { 'retry-after': '0' }))).toBe(1000);
  });

  it('honors Retry-After seconds, capped at 30s', () => {
    expect(retryDelayMs(axiosErr(429, { 'retry-after': '7' }))).toBe(7000);
    expect(retryDelayMs(axiosErr(429, { 'retry-after': '120' }))).toBe(30_000);
  });
});

describe('retryOnce (through getAccounts)', () => {
  it('retries a transient failure once after 1s and maps the result', async () => {
    seam.accountsResponses.push(() => {
      throw axiosErr(503);
    }, accountsOk);

    const promise = getAccounts('tok');
    await vi.runAllTimersAsync();
    expect(await promise).toEqual([
      {
        accountId: 'acc-1',
        name: 'Blue Cash Preferred®',
        officialName: 'Blue Cash Preferred® Card',
        mask: '1005',
        type: 'credit',
        subtype: 'credit card',
        balanceAvailable: 100,
        balanceCurrent: 50,
        balanceLimit: 1000,
        isoCurrencyCode: 'USD',
        unofficialCurrencyCode: null,
      },
    ]);
    const [first = 0, second = 0] = seam.accountsAttempts;
    expect(seam.accountsAttempts).toHaveLength(2);
    expect(second - first).toBe(1000);
  });

  it('waits out a 429 Retry-After before the second attempt', async () => {
    seam.accountsResponses.push(() => {
      throw axiosErr(429, { 'retry-after': '7' });
    }, accountsOk);

    const promise = getAccounts('tok');
    await vi.advanceTimersByTimeAsync(6999);
    expect(seam.accountsAttempts).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await promise;
    expect(seam.accountsAttempts).toHaveLength(2);
  });

  it('gives up after the single retry, surfacing the second error', async () => {
    const secondError = axiosErr(500);
    seam.accountsResponses.push(
      () => {
        throw axiosErr(503);
      },
      () => {
        throw secondError;
      },
    );

    const promise = getAccounts('tok');
    const assertion = expect(promise).rejects.toBe(secondError);
    await vi.runAllTimersAsync();
    await assertion;
    expect(seam.accountsAttempts).toHaveLength(2);
  });

  it('propagates a non-transient 4xx immediately with no retry', async () => {
    const denial = axiosErr(400);
    seam.accountsResponses.push(() => {
      throw denial;
    });

    await expect(getAccounts('tok')).rejects.toBe(denial);
    expect(seam.accountsAttempts).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('syncTransactions', () => {
  it('requests full 500-row pages and threads the cursor between pages', async () => {
    seam.syncResponses.push(
      () => page({ added: [plaidTxn('t1')], next_cursor: 'c1', has_more: true }),
      () => page({ added: [plaidTxn('t2')], next_cursor: 'c2', has_more: false }),
    );

    const batch = await syncTransactions('tok', null);
    expect(seam.syncRequests).toEqual([
      { cursor: undefined, count: 500 },
      { cursor: 'c1', count: 500 },
    ]);
    expect(batch.added.map((txn) => txn.transactionId)).toEqual(['t1', 't2']);
    expect(batch.cursor).toBe('c2');
  });

  it('adapts transactions to provider shapes, preferring the modern category field', async () => {
    const raw = plaidTxn('t1', { personal_finance_category: { primary: 'FOOD_AND_DRINK' } });
    seam.syncResponses.push(() =>
      page({
        added: [raw, plaidTxn('t2', { category: ['Coffee'] }), plaidTxn('t3')],
        modified: [plaidTxn('t4', { pending: true })],
        removed: [{ transaction_id: 'gone' }],
      }),
    );

    const batch = await syncTransactions('tok', null);
    expect(batch.added[0]).toEqual({
      transactionId: 't1',
      accountId: 'acc-1',
      date: '2026-09-01',
      name: 'COFFEE SHOP 42',
      merchantName: 'Coffee Shop',
      amount: 4.5,
      isoCurrencyCode: 'USD',
      unofficialCurrencyCode: null,
      category: 'FOOD_AND_DRINK',
      pending: false,
      pendingTransactionId: null,
      raw,
    });
    expect(batch.added[1]?.category).toBe('Coffee');
    expect(batch.added[2]?.category).toBeNull();
    expect(batch.modified[0]?.pending).toBe(true);
    expect(batch.removed).toEqual([{ transactionId: 'gone' }]);
  });

  it('waits 2s on a not-ready stall without advancing the cursor', async () => {
    seam.syncResponses.push(
      () => page({ next_cursor: '', has_more: true }),
      () => page({ added: [plaidTxn('t1')], next_cursor: 'c1', has_more: false }),
    );

    const promise = syncTransactions('tok', null);
    await vi.advanceTimersByTimeAsync(1999);
    expect(seam.syncRequests).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    const batch = await promise;
    expect(seam.syncRequests[1]?.cursor).toBeUndefined();
    expect(batch.cursor).toBe('c1');
  });

  it('spends the not-ready budget cumulatively across the drain, not per stall', async () => {
    const stall = () => page({ next_cursor: '', has_more: true });
    const progress = (cursor: string) => () =>
      page({ added: [plaidTxn(cursor)], next_cursor: cursor, has_more: true });
    // Budget 2: two stalls are absorbed even split by real pages; a third throws.
    seam.syncResponses.push(stall, progress('c1'), stall, progress('c2'), stall);

    const promise = syncTransactions('tok', null, { notReadyRetries: 2 });
    const assertion = expect(promise).rejects.toMatchObject({ code: 'NOT_READY', status: 503 });
    await vi.runAllTimersAsync();
    await assertion;
    await expect(promise).rejects.toBeInstanceOf(PublicError);
    expect(seam.syncRequests).toHaveLength(5);
  });

  it('stops a drain at the 200-page budget with the resume cursor, marked incomplete', async () => {
    for (let i = 0; i < 200; i++) {
      seam.syncResponses.push(() => page({ next_cursor: `c${i}`, has_more: true }));
    }

    const promise = syncTransactions('tok', null);
    await vi.runAllTimersAsync();
    const batch = await promise;
    // The budget check stops before a 201st request is made; the last page's
    // cursor comes back so the next sync resumes instead of refetching.
    expect(seam.syncRequests).toHaveLength(200);
    expect(batch.incomplete).toBe(true);
    expect(batch.cursor).toBe('c199');
  });

  it('retries a transient failure mid-drain and keeps the accumulated pages', async () => {
    seam.syncResponses.push(
      () => page({ added: [plaidTxn('t1')], next_cursor: 'c1', has_more: true }),
      () => {
        throw axiosErr(503);
      },
      () => page({ added: [plaidTxn('t2')], next_cursor: 'c2', has_more: false }),
    );

    const promise = syncTransactions('tok', null);
    await vi.runAllTimersAsync();
    const batch = await promise;
    expect(batch.added.map((txn) => txn.transactionId)).toEqual(['t1', 't2']);
    expect(batch.cursor).toBe('c2');
  });
});
