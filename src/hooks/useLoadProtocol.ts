'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '@/lib/http';
import { logError } from '@/lib/log';

// Settles a keyed set of reads together; a failed read yields null so one
// failure never discards a sibling that did arrive.
// Design: partial-load-rendering.
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

// The load call a hook's `perform` receives: a keyed set of reads and the
// `apply` that writes their bodies (null where a read failed) into the
// hook's own state.
export type LoadReads<K extends string> = <T extends Record<K, unknown>>(
  reads: T,
  apply: (bodies: { [P in keyof T]: Awaited<T[P]> | null }) => void,
) => Promise<void>;

// The load lifecycle every data hook shares. `perform` must be memoized
// (useCallback keyed on its read inputs — account id, page): the load effect
// re-runs on its identity. `initialLoaded` and `stickyKeys` are read once on
// the first render.
// Design: partial-load-rendering, superseded-loads-write-nothing,
// home-reflects-background-sync.
export function useLoadProtocol<K extends string>(
  initialLoaded: Record<K, boolean>,
  perform: (load: LoadReads<K>) => Promise<void>,
  // NoInfer: K comes from initialLoaded alone, so a stickyKeys typo is an
  // error instead of silently narrowing K.
  options?: { stickyKeys?: readonly NoInfer<K>[] },
) {
  const [settled, setSettled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Record<K, boolean>>(initialLoaded);
  // Loud reload (Retry) in flight; cleared when the next un-superseded load
  // settles.
  const [reloading, setReloading] = useState(false);
  // Staleness ticket: only the newest load writes. A ref, not state: `load`
  // (referentially stable) must read the current value, not the one from its
  // own render. Design: superseded-loads-write-nothing.
  const latestTicket = useRef(0);
  // Captured once so `load` stays referentially stable across renders.
  const stickyKeys = useRef(options?.stickyKeys).current;

  const load = useCallback(
    async <T extends Record<K, unknown>>(
      reads: T,
      apply: (bodies: { [P in keyof T]: Awaited<T[P]> | null }) => void,
    ): Promise<void> => {
      const ticket = ++latestTicket.current;
      const { bodies, succeeded, error: failureMessage } = await settleReads(reads);
      // Superseded by a newer load: write nothing, apply included.
      // Design: superseded-loads-write-nothing.
      if (ticket !== latestTicket.current) return;
      // A throwing `apply` must not skip the settlement writes below, or the
      // page wedges on "Loading…"; the bug surfaces in the error line.
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
          // T extends Record<K, unknown>, so every K is a key of `succeeded`.
          const nowSucceeded = (succeeded as Record<K, boolean>)[key];
          next[key] = stickyKeys?.includes(key) ? previous[key] || nowSucceeded : nowSucceeded;
        }
        return next;
      });
      setError([failureMessage, applyFailure].filter(Boolean).join('; ') || null);
      setSettled(true);
      setReloading(false);
    },
    [stickyKeys],
  );

  // Every call site fires refresh un-awaited (`void refresh()`), so a
  // rejecting `perform` is caught and logged here rather than left unhandled.
  const refresh = useCallback(async () => {
    try {
      await perform(load);
    } catch (err) {
      logError('load failed:', err);
    }
  }, [perform, load]);

  // Mount and input changes (perform's identity carries its deps).
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const clearError = useCallback(() => setError(null), []);
  const reload = useCallback(() => {
    setReloading(true);
    void refresh();
  }, [refresh]);
  // The Retry action: clear the shown error, then reload loudly.
  const retry = useCallback(() => {
    clearError();
    reload();
  }, [clearError, reload]);
  return { settled, error, loaded, clearError, refresh, reload, retry, reloading };
}

// The slice of a protocol instance a page treats as one lifecycle. Derived
// from the hook's return, so a renamed protocol field fails to compile here.
type LoadState = Pick<
  ReturnType<typeof useLoadProtocol>,
  'settled' | 'error' | 'clearError' | 'reload' | 'retry'
>;

// A page running several protocol instances treats them as one lifecycle:
// settled when every instance is, errors joined, Retry clears and reloads
// them all.
export function combineLoadStates(states: readonly LoadState[]): LoadState {
  const clearError = () => states.forEach((state) => state.clearError());
  const reload = () => states.forEach((state) => state.reload());
  return {
    settled: states.every((state) => state.settled),
    error:
      states
        .map((state) => state.error)
        .filter(Boolean)
        .join('; ') || null,
    clearError,
    reload,
    retry: () => {
      clearError();
      reload();
    },
  };
}
