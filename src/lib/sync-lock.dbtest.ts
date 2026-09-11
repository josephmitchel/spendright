import { afterAll, describe, expect, it } from 'vitest';
import { pool } from '@/lib/db';
import { isPoolConnectTimeout, withItemSyncLock } from '@/lib/sync-lock';
import { endPools } from '../../test/db-fixtures';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function gate() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { open, opened };
}

// Positive signal that a second caller is actually blocked in
// pg_advisory_lock, instead of a wall-clock sleep.
async function waitForAdvisoryWaiter(): Promise<void> {
  const deadline = Date.now() + 5_000;
  for (;;) {
    const { rows } = await pool.query<{ waiting: boolean }>(
      "select count(*)::int > 0 as waiting from pg_locks where locktype = 'advisory' and not granted",
    );
    if (rows[0]?.waiting) return;
    if (Date.now() > deadline) throw new Error('no advisory-lock waiter appeared');
    await sleep(25);
  }
}

afterAll(async () => {
  await endPools();
});

describe('withItemSyncLock', () => {
  it('serializes two holders of the same item across sessions', async () => {
    const order: string[] = [];
    const first = gate();
    const firstStarted = gate();

    const a = withItemSyncLock('itm-lock', async () => {
      order.push('a-start');
      firstStarted.open();
      await first.opened;
      order.push('a-end');
    });
    await firstStarted.opened;
    const b = withItemSyncLock('itm-lock', async () => {
      order.push('b-start');
    });
    await waitForAdvisoryWaiter();
    expect(order).toEqual(['a-start']);

    first.open();
    await Promise.all([a, b]);
    expect(order).toEqual(['a-start', 'a-end', 'b-start']);
  });

  it('does not block a different item', async () => {
    const first = gate();
    const firstStarted = gate();
    let otherRan = false;

    const a = withItemSyncLock('itm-lock-a', async () => {
      firstStarted.open();
      await first.opened;
    });
    await firstStarted.opened;
    await withItemSyncLock('itm-lock-b', async () => {
      otherRan = true;
    });
    expect(otherRan).toBe(true);

    first.open();
    await a;
  });

  it('releases the lock when the task throws', async () => {
    await expect(
      withItemSyncLock('itm-lock', () => Promise.reject(new Error('task boom'))),
    ).rejects.toThrow('task boom');

    const reacquired = await withItemSyncLock('itm-lock', async () => 'ok');
    expect(reacquired).toBe('ok');
  });

  it('maps a wait past lock_timeout to a SYNC_LOCKED 503', async () => {
    const held = gate();
    const holderStarted = gate();
    const holder = withItemSyncLock('itm-lock-timeout', async () => {
      holderStarted.open();
      await held.opened;
    });
    await holderStarted.opened;

    await expect(
      withItemSyncLock('itm-lock-timeout', async () => 'never runs', { lockTimeoutMs: 300 }),
    ).rejects.toMatchObject({ status: 503, code: 'SYNC_LOCKED' });

    held.open();
    await holder;
  });

  it('classifies the lockPool connect-timeout shape that also maps to SYNC_LOCKED', () => {
    // pg-pool's connectionTimeoutMillis rejection: message only, no SQLSTATE.
    expect(isPoolConnectTimeout(new Error('timeout exceeded when trying to connect'))).toBe(true);
    expect(isPoolConnectTimeout(new Error('something else'))).toBe(false);
    expect(isPoolConnectTimeout({ code: '55P03' })).toBe(false);
  });
});
