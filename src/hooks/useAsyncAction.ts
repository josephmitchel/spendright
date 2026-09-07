'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '@/lib/http';

// A mutation's in-flight guard, error state, and settle order.
// Design: shared-mutation-protocol.
//
// `run` returns void so DOM handlers and function props can take it
// directly. The in-flight guard is keyed: a singleton action (no `key`)
// drops a run while one is pending; a per-row action passes `key` so only a
// re-run of the same row is dropped. The guard reads a ref, not `pending`,
// so two runs in one tick cannot both pass.
export function useAsyncAction<Args extends unknown[]>(
  action: (...args: Args) => Promise<void>,
  failureMessage: string,
  options?: { key?: (...args: Args) => string },
) {
  const [pendingCount, setPendingCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(new Set<string>());
  // Latest-ref pattern so `run` stays referentially stable while always
  // calling the current render's action; `key` must be pure.
  const currentRef = useRef({ action, key: options?.key });
  useEffect(() => {
    currentRef.current = { action, key: options?.key };
  });

  const run = useCallback(
    (...args: Args): void => {
      const key = currentRef.current.key?.(...args) ?? '';
      if (inFlight.current.has(key)) return;
      inFlight.current.add(key);
      setPendingCount((count) => count + 1);
      setError(null);
      void (async () => {
        try {
          await currentRef.current.action(...args);
        } catch (err) {
          setError(errorMessage(err, failureMessage));
        } finally {
          inFlight.current.delete(key);
          setPendingCount((count) => count - 1);
        }
      })();
    },
    [failureMessage],
  );

  const clear = useCallback(() => setError(null), []);

  return { run, pending: pendingCount > 0, error, clear };
}
