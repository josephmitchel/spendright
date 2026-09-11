'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '@/lib/http';
import { logError } from '@/lib/log';

async function settleReads<T extends Record<string, unknown>>(
  reads: T,
): Promise<{
  bodies: { [K in keyof T]: Awaited<T[K]> | null };
  succeeded: { [K in keyof T]: boolean };
  error: string | null;
}> {
  const keys = Object.keys(reads) as Array<keyof T & string>;
  const outcomes = await Promise.allSettled(keys.map((key) => reads[key]));
  const bodies = {} as { [K in keyof T]: Awaited<T[K]> | null };
  const succeeded = {} as { [K in keyof T]: boolean };
  const messages: string[] = [];
  keys.forEach((key, index) => {
    const outcome = outcomes[index];
    if (!outcome) throw new Error('Promise.allSettled dropped an outcome');
    if (outcome.status === 'fulfilled') {
      bodies[key] = outcome.value as Awaited<T[typeof key]>;
      succeeded[key] = true;
    } else {
      bodies[key] = null;
      succeeded[key] = false;
      logError('read failed:', outcome.reason);
      messages.push(errorMessage(outcome.reason, 'Failed to load'));
    }
  });
  return { bodies, succeeded, error: messages.length > 0 ? messages.join('; ') : null };
}

export type LoadReads<K extends string> = <T extends Record<K, unknown>>(
  reads: T,
  apply: (bodies: { [P in keyof T]: Awaited<T[P]> | null }) => void,
) => Promise<void>;

// Caller contract: `perform` is memoized (the load effect re-runs on its
// identity); `initialLoaded` and `stickyKeys` are read once.
export function useLoadProtocol<K extends string>(
  initialLoaded: Record<K, boolean>,
  perform: (load: LoadReads<K>) => Promise<void>,
  options?: { stickyKeys?: readonly NoInfer<K>[] },
) {
  const [settled, setSettled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Record<K, boolean>>(initialLoaded);
  // `fresh` is never sticky: it reports the latest settled load's reads only,
  // so write-safety gates see a failed poll that sticky view state ignores.
  const [fresh, setFresh] = useState<Record<K, boolean>>(initialLoaded);
  const [reloading, setReloading] = useState(false);
  const latestTicket = useRef(0);
  const stickyKeys = useRef(options?.stickyKeys).current;

  const load = useCallback(
    async <T extends Record<K, unknown>>(
      reads: T,
      apply: (bodies: { [P in keyof T]: Awaited<T[P]> | null }) => void,
    ): Promise<void> => {
      const ticket = ++latestTicket.current;
      const { bodies, succeeded, error: failureMessage } = await settleReads(reads);
      if (ticket !== latestTicket.current) return;
      // A throwing `apply` must not skip the settlement writes below.
      let applyFailure: string | null = null;
      try {
        apply(bodies);
      } catch (err) {
        logError('apply failed:', err);
        applyFailure = errorMessage(err, 'Failed to apply loaded data');
      }
      setLoaded((previous) => {
        const next = { ...previous };
        for (const key of Object.keys(previous) as K[]) {
          const nowSucceeded = (succeeded as Record<K, boolean>)[key];
          next[key] = stickyKeys?.includes(key) ? previous[key] || nowSucceeded : nowSucceeded;
        }
        return next;
      });
      setFresh((previous) => {
        const next = { ...previous };
        for (const key of Object.keys(previous) as K[]) {
          next[key] = (succeeded as Record<K, boolean>)[key];
        }
        return next;
      });
      setError([failureMessage, applyFailure].filter(Boolean).join('; ') || null);
      setSettled(true);
      setReloading(false);
    },
    [stickyKeys],
  );

  const refresh = useCallback(async () => {
    try {
      await perform(load);
      return true;
    } catch (err) {
      logError('load failed:', err);
      return false;
    }
  }, [perform, load]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const clearError = useCallback(() => setError(null), []);
  const reload = useCallback(() => {
    setReloading(true);
    void refresh().then((performed) => {
      if (!performed) setReloading(false);
    });
  }, [refresh]);
  const retry = useCallback(() => {
    clearError();
    reload();
  }, [clearError, reload]);
  return { settled, error, loaded, fresh, clearError, refresh, reload, retry, reloading };
}

type LoadState = Pick<
  ReturnType<typeof useLoadProtocol>,
  'settled' | 'error' | 'clearError' | 'reload' | 'retry' | 'reloading'
>;

export function combineLoadStates(states: readonly LoadState[]): LoadState {
  return {
    settled: states.every((state) => state.settled),
    error:
      states
        .map((state) => state.error)
        .filter(Boolean)
        .join('; ') || null,
    clearError: () => states.forEach((state) => state.clearError()),
    reload: () => states.forEach((state) => state.reload()),
    retry: () => states.forEach((state) => state.retry()),
    reloading: states.some((state) => state.reloading),
  };
}
