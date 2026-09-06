'use client';

import { useCallback, useRef, useState } from 'react';
import { settleReads } from '@/lib/http';

// The whole load lifecycle every data hook shares, owned here rather than
// re-implemented per hook: `load` settles a keyed set of reads together
// (settleReads, design: partial-load-rendering), hands the per-read outcomes
// to the caller's `apply`, and then writes the protocol state — `loaded`
// (which reads actually came back; a failed read is not evidence of
// anything), `error` (the latest load's failures folded into one message)
// and `settled` (the first load finished, success or failure) — in one fixed
// sequence, so the ordering and the staleness guard can never drift between
// hooks again.
//
// Staleness is one mechanism for every hook: a generation counter. A load
// superseded by a newer one writes nothing, apply included; a load settling
// after unmount is a no-op setState. Design: superseded-loads-write-nothing.
//
// `stickyKeys` declares which reads keep `loaded` true once any load
// succeeded (rendered rows survive a later failed refresh); every other key
// follows the latest load (an empty-state claim needs current evidence).
// Design: partial-load-rendering.
export function useLoadProtocol<K extends string>(
  initialLoaded: Record<K, boolean>,
  // NoInfer: K comes from initialLoaded alone, so a stickyKeys typo is an
  // error instead of silently narrowing K.
  options?: { stickyKeys?: readonly NoInfer<K>[] },
) {
  const [settled, setSettled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Record<K, boolean>>(initialLoaded);
  const generation = useRef(0);
  // Captured once so `load` stays referentially stable across renders.
  const stickyKeys = useRef(options?.stickyKeys).current;

  const load = useCallback(
    async <T extends Record<K, unknown>>(
      reads: T,
      apply: (results: { [P in keyof T]: PromiseSettledResult<Awaited<T[P]>> }) => void,
    ): Promise<void> => {
      const ticket = ++generation.current;
      const { results, succeeded, error: failureMessage } = await settleReads(reads);
      if (ticket !== generation.current) return;
      apply(results);
      setLoaded((previous) => {
        const next = { ...previous };
        for (const key of Object.keys(previous) as K[]) {
          // T extends Record<K, unknown>, so every K is a key of `succeeded`.
          const nowSucceeded = (succeeded as Record<K, boolean>)[key];
          next[key] = stickyKeys?.includes(key) ? previous[key] || nowSucceeded : nowSucceeded;
        }
        return next;
      });
      setError(failureMessage);
      setSettled(true);
    },
    [stickyKeys],
  );

  const clearError = useCallback(() => setError(null), []);
  return { settled, error, loaded, clearError, load };
}
