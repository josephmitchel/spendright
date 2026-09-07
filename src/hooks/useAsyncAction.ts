'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '@/lib/http';

// Design: shared-mutation-protocol.
export function useAsyncAction<Args extends unknown[]>(
  action: (...args: Args) => Promise<void>,
  failureMessage: string,
  options?: { key?: (...args: Args) => string },
) {
  const [pendingCount, setPendingCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(new Set<string>());
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

  const clearError = useCallback(() => setError(null), []);

  return { run, pending: pendingCount > 0, error, clearError };
}
