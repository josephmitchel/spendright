'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '@/lib/http';

// Errors are tracked per run key so concurrent actions on different targets
// can't clear each other's failure. Design: shared-mutation-protocol.
export function useAsyncAction<Args extends unknown[]>(
  action: (...args: Args) => Promise<void>,
  failureMessage: string,
  options?: { key?: (...args: Args) => string },
) {
  const [pendingCount, setPendingCount] = useState(0);
  const [errors, setErrors] = useState<ReadonlyMap<string, string>>(new Map());
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
      setErrors((previous) => {
        if (!previous.has(key)) return previous;
        const next = new Map(previous);
        next.delete(key);
        return next;
      });
      void (async () => {
        try {
          await currentRef.current.action(...args);
        } catch (err) {
          const message = errorMessage(err, failureMessage);
          setErrors((previous) => new Map(previous).set(key, message));
        } finally {
          inFlight.current.delete(key);
          setPendingCount((count) => count - 1);
        }
      })();
    },
    [failureMessage],
  );

  const clearError = useCallback(() => setErrors(new Map()), []);

  return {
    run,
    pending: pendingCount > 0,
    error: errors.size > 0 ? [...errors.values()].join('; ') : null,
    clearError,
  };
}
