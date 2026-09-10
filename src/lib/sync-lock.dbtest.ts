import { afterAll, describe, expect, it } from 'vitest';
import { pool } from '@/lib/db';
import { withItemSyncLock } from '@/lib/sync-lock';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function gate() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { open, opened };
}

afterAll(async () => {
  await pool.end();
});

describe('withItemSyncLock', () => {
  it('serializes two holders of the same item across sessions', async () => {
    const order: string[] = [];
    const first = gate();

    const a = withItemSyncLock('itm-lock', async () => {
      order.push('a-start');
      await first.opened;
      order.push('a-end');
    });
    await sleep(400);
    const b = withItemSyncLock('itm-lock', async () => {
      order.push('b-start');
    });
    await sleep(400);
    expect(order).toEqual(['a-start']);

    first.open();
    await Promise.all([a, b]);
    expect(order).toEqual(['a-start', 'a-end', 'b-start']);
  });

  it('does not block a different item', async () => {
    const first = gate();
    let otherRan = false;

    const a = withItemSyncLock('itm-lock-a', async () => {
      await first.opened;
    });
    await sleep(200);
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
});
