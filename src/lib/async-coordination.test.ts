import { describe, expect, it } from 'vitest';
import { serializeByKey, singleFlight } from '@/lib/async-coordination';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const settle = () => new Promise((res) => setTimeout(res, 0));

describe('serializeByKey', () => {
  it('runs at most one task per key, in submission order', async () => {
    const tails = new Map<string, Promise<void>>();
    const first = deferred<string>();
    const started: string[] = [];

    const run1 = serializeByKey(tails, 'k', () => {
      started.push('one');
      return first.promise;
    });
    const run2 = serializeByKey(tails, 'k', () => {
      started.push('two');
      return Promise.resolve('two');
    });

    await settle();
    expect(started).toEqual(['one']);

    first.resolve('one');
    expect(await run1).toBe('one');
    expect(await run2).toBe('two');
    expect(started).toEqual(['one', 'two']);
  });

  it('propagates a rejection to its own caller without poisoning the chain', async () => {
    const tails = new Map<string, Promise<void>>();
    const run1 = serializeByKey(tails, 'k', () => Promise.reject(new Error('boom')));
    const run2 = serializeByKey(tails, 'k', () => Promise.resolve('fine'));

    await expect(run1).rejects.toThrow('boom');
    expect(await run2).toBe('fine');
  });

  it('runs different keys concurrently', async () => {
    const tails = new Map<string, Promise<void>>();
    const a = deferred<string>();
    const started: string[] = [];

    void serializeByKey(tails, 'a', () => {
      started.push('a');
      return a.promise;
    }).catch(() => undefined);
    void serializeByKey(tails, 'b', () => {
      started.push('b');
      return Promise.resolve('b');
    });

    await settle();
    expect(started).toEqual(['a', 'b']);
    a.resolve('a');
  });

  it('cleans its map entry up once the chain drains', async () => {
    const tails = new Map<string, Promise<void>>();
    await serializeByKey(tails, 'k', () => Promise.resolve('done'));
    await settle();
    expect(tails.has('k')).toBe(false);
  });
});

describe('singleFlight', () => {
  it('joins a caller arriving during a run instead of starting another', async () => {
    const slot = { inFlight: null as Promise<string> | null };
    const gate = deferred<string>();
    let runs = 0;

    const p1 = singleFlight(slot, () => {
      runs++;
      return gate.promise;
    });
    const p2 = singleFlight(slot, () => {
      runs++;
      return Promise.resolve('second');
    });

    expect(p2).toBe(p1);
    gate.resolve('joined');
    expect(await p1).toBe('joined');
    expect(await p2).toBe('joined');
    expect(runs).toBe(1);
  });

  it('clears the slot after settling so the next call runs fresh', async () => {
    const slot = { inFlight: null as Promise<string> | null };
    expect(await singleFlight(slot, () => Promise.resolve('first'))).toBe('first');
    expect(slot.inFlight).toBeNull();
    expect(await singleFlight(slot, () => Promise.resolve('second'))).toBe('second');
  });

  it('clears the slot after a rejection too', async () => {
    const slot = { inFlight: null as Promise<string> | null };
    await expect(singleFlight(slot, () => Promise.reject(new Error('boom')))).rejects.toThrow(
      'boom',
    );
    expect(slot.inFlight).toBeNull();
  });
});
