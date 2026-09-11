import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { combineLoadStates, useLoadProtocol, type LoadReads } from '@/hooks/useLoadProtocol';

interface Deferred {
  resolve: (value: string) => void;
  reject: (err: unknown) => void;
}

// Each perform() call consumes one controllable read, so tests decide which
// load settles first and with what.
function harness(options?: { stickyKeys?: readonly 'data'[] }) {
  const reads: Deferred[] = [];
  const applied: Array<string | null> = [];
  const perform = (load: LoadReads<'data'>) =>
    load(
      {
        data: new Promise<string>((resolve, reject) => {
          reads.push({ resolve, reject });
        }),
      },
      (bodies) => {
        applied.push(bodies.data);
      },
    );
  const hook = renderHook(() => useLoadProtocol<'data'>({ data: false }, perform, options));
  return { reads, applied, hook };
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('useLoadProtocol', () => {
  it('applies a settled load and reports loaded/fresh/settled', async () => {
    const { reads, applied, hook } = harness();
    await waitFor(() => expect(reads).toHaveLength(1));

    await act(async () => reads[0]?.resolve('first'));
    expect(applied).toEqual(['first']);
    expect(hook.result.current.settled).toBe(true);
    expect(hook.result.current.loaded.data).toBe(true);
    expect(hook.result.current.fresh.data).toBe(true);
    expect(hook.result.current.error).toBe(null);
  });

  it('dismisses a stale load that settles after a newer one', async () => {
    const { reads, applied, hook } = harness();
    await waitFor(() => expect(reads).toHaveLength(1));
    await act(async () => {
      void hook.result.current.refresh();
    });
    await waitFor(() => expect(reads).toHaveLength(2));

    // The newer load settles first; the older one must be ignored entirely.
    await act(async () => reads[1]?.resolve('newer'));
    await act(async () => reads[0]?.resolve('stale'));
    expect(applied).toEqual(['newer']);
    expect(hook.result.current.error).toBe(null);
  });

  it('keeps a sticky key loaded across a failed poll while fresh flips false', async () => {
    const { reads, hook } = harness({ stickyKeys: ['data'] });
    await waitFor(() => expect(reads).toHaveLength(1));
    await act(async () => reads[0]?.resolve('first'));
    expect(hook.result.current.loaded.data).toBe(true);

    await act(async () => {
      void hook.result.current.refresh();
    });
    await waitFor(() => expect(reads).toHaveLength(2));
    await act(async () => reads[1]?.reject(new Error('poll failed')));

    // Sticky view state survives; write-safety (fresh) does not.
    expect(hook.result.current.loaded.data).toBe(true);
    expect(hook.result.current.fresh.data).toBe(false);
    expect(hook.result.current.error).toContain('poll failed');
  });

  it('drops a non-sticky key back to unloaded on a failed poll', async () => {
    const { reads, hook } = harness();
    await waitFor(() => expect(reads).toHaveLength(1));
    await act(async () => reads[0]?.resolve('first'));

    await act(async () => {
      void hook.result.current.refresh();
    });
    await waitFor(() => expect(reads).toHaveLength(2));
    await act(async () => reads[1]?.reject(new Error('poll failed')));

    expect(hook.result.current.loaded.data).toBe(false);
    expect(hook.result.current.fresh.data).toBe(false);
  });

  it('retry clears the error and reloads', async () => {
    const { reads, applied, hook } = harness();
    await waitFor(() => expect(reads).toHaveLength(1));
    await act(async () => reads[0]?.reject(new Error('boom')));
    expect(hook.result.current.error).toContain('boom');

    await act(async () => {
      hook.result.current.retry();
    });
    expect(hook.result.current.reloading).toBe(true);
    await waitFor(() => expect(reads).toHaveLength(2));
    await act(async () => reads[1]?.resolve('recovered'));
    expect(applied).toEqual([null, 'recovered']);
    expect(hook.result.current.error).toBe(null);
    expect(hook.result.current.reloading).toBe(false);
  });
});

describe('combineLoadStates', () => {
  it('is settled only when all are, and joins errors', () => {
    const state = (over: Partial<ReturnType<typeof combineLoadStates>>) => ({
      settled: true,
      error: null,
      clearError: () => undefined,
      reload: () => undefined,
      retry: () => undefined,
      reloading: false,
      ...over,
    });
    const combined = combineLoadStates([state({ error: 'a' }), state({ settled: false })]);
    expect(combined.settled).toBe(false);
    expect(combined.error).toBe('a');
    expect(combineLoadStates([state({ error: 'a' }), state({ error: 'b' })]).error).toBe('a; b');
    expect(combineLoadStates([state({}), state({ reloading: true })]).reloading).toBe(true);
  });
});
