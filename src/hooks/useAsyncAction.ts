'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '@/lib/http';

// Errors and pending state are both tracked per run key so concurrent actions
// on different targets can't clear each other's failure or claim each other's
// in-flight status.
export function useAsyncAction<Args extends unknown[]>(
  action: (...args: Args) => Promise<void>,
  failureMessage: string,
  options?: { key?: (...args: Args) => string },
) {
  const [pendingKeys, setPendingKeys] = useState<ReadonlySet<string>>(new Set());
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
      setPendingKeys((previous) => new Set(previous).add(key));
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
          setPendingKeys((previous) => {
            const next = new Set(previous);
            next.delete(key);
            return next;
          });
        }
      })();
    },
    [failureMessage],
  );

  const clearError = useCallback(() => setErrors(new Map()), []);

  return {
    run,
    pending: pendingKeys.size > 0,
    pendingKeys,
    error: errors.size > 0 ? [...errors.values()].join('; ') : null,
    errors,
    clearError,
  };
}
