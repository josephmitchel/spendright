'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '@/lib/http';
import { logError } from '@/lib/log';

// Settles a keyed set of reads together, so one failure never discards a
// sibling that did arrive. `results` carries each read's typed outcome,
// `succeeded` is the per-read gate for messages that assert what the database
// holds, and `error` folds the failures (each also logged) into one on-screen
// message, null when nothing failed. Lives here rather than with the
// coordination primitives in src/lib/serialize.ts: useLoadProtocol is its
// only caller, and it builds user-facing strings (errorMessage), which keeps
// serialize.ts dependency-free for the server modules that import it.
// Design: partial-load-rendering.
// The constraint is not Record<string, Promise<unknown>>: that would
// contextually type each read as Promise<unknown> and collapse the inferred
// value types; Awaited<T[K]> does the unwrapping instead.
async function settleReads<T extends Record<string, unknown>>(
  reads: T,
): Promise<{
  results: { [K in keyof T]: PromiseSettledResult<Awaited<T[K]>> };
  succeeded: { [K in keyof T]: boolean };
  error: string | null;
}> {
  const keys = Object.keys(reads) as Array<keyof T & string>;
  const outcomes = await Promise.allSettled(keys.map((key) => reads[key]));
  const results = {} as { [K in keyof T]: PromiseSettledResult<Awaited<T[K]>> };
  const succeeded = {} as { [K in keyof T]: boolean };
  const messages: string[] = [];
  keys.forEach((key, index) => {
    // allSettled yields one outcome per input; satisfies the checked index.
    const outcome = outcomes[index];
    if (!outcome) return;
    results[key] = outcome as (typeof results)[typeof key];
    succeeded[key] = outcome.status === 'fulfilled';
    if (outcome.status === 'rejected') {
      logError('read failed:', outcome.reason);
      messages.push(errorMessage(outcome.reason, 'Failed to load'));
    }
  });
  return { results, succeeded, error: messages.length > 0 ? messages.join('; ') : null };
}

// The load call a hook's `perform` receives: a keyed set of reads and the
// `apply` that writes their outcomes into the hook's own state.
export type LoadReads<K extends string> = <T extends Record<K, unknown>>(
  reads: T,
  apply: (results: { [P in keyof T]: PromiseSettledResult<Awaited<T[P]>> }) => void,
) => Promise<void>;

// The whole load lifecycle every data hook shares, owned here rather than
// re-implemented per hook — the load effect included: the protocol runs
// `perform(load)` on mount, whenever `perform`'s identity changes (its
// useCallback deps are the read's inputs — account id, page), and on every
// `reload()`. `load` settles the keyed reads together (settleReads above,
// design: partial-load-rendering), hands the per-read outcomes to the
// caller's `apply`, and then writes the protocol state — `loaded` (which
// reads actually came back; a failed read is not evidence of anything),
// `error` (the latest load's failures folded into one message) and `settled`
// (the first load finished, success or failure) — in one fixed sequence, so
// the ordering and the staleness guard can never drift between hooks again.
//
// Staleness is one mechanism for every hook: a generation counter. A load
// superseded by a newer one writes nothing, apply included; a load settling
// after unmount is a no-op setState. Design: superseded-loads-write-nothing.
//
// `stickyKeys` declares which reads keep `loaded` true once any load
// succeeded (rendered rows survive a later failed refresh); every other key
// follows the latest load (an empty-state claim needs current evidence).
// Design: partial-load-rendering.
//
// Reloading is part of the protocol too, wiring included: `reload()` re-runs
// `perform` loudly by bumping a token the protocol's own effect is keyed on,
// so no hook wires (or mis-wires) a reload effect of its own. The token
// never leaves this hook; `reloading` — true from a reload() until a load
// begun at or after it settles — is what a consumer keys an in-flight
// indicator on. `refresh` re-runs the same read silently (polling): no token
// bump, so `reloading` stays quiet. Design: home-reflects-background-sync.
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
  const [reloadToken, setReloadToken] = useState(0);
  // The newest token any un-superseded load had at its start; `reloading`
  // until it catches the token back up.
  const [settledToken, setSettledToken] = useState(0);
  const generation = useRef(0);
  // Mirrors reloadToken so `load` (referentially stable) reads the current
  // token, not the one from its own render.
  const reloadTokenRef = useRef(0);
  // Captured once so `load` stays referentially stable across renders.
  const stickyKeys = useRef(options?.stickyKeys).current;

  const load = useCallback(
    async <T extends Record<K, unknown>>(
      reads: T,
      apply: (results: { [P in keyof T]: PromiseSettledResult<Awaited<T[P]>> }) => void,
    ): Promise<void> => {
      const ticket = ++generation.current;
      const token = reloadTokenRef.current;
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
      setSettledToken((previous) => Math.max(previous, token));
    },
    [stickyKeys],
  );

  const refresh = useCallback(() => perform(load), [perform, load]);

  useEffect(() => {
    // reloadToken is read here, not just listed, so a dead-dependency cleanup
    // (human or autofixer) can never prune the reload trigger and silently
    // turn a Retry button into a no-op.
    void reloadToken;
    void refresh();
  }, [refresh, reloadToken]);

  const clearError = useCallback(() => setError(null), []);
  const reload = useCallback(() => {
    reloadTokenRef.current += 1;
    setReloadToken(reloadTokenRef.current);
  }, []);
  // A silent refresh that starts after the reload counts as settling it: it
  // carries data at least as fresh as the loud re-run's.
  const reloading = settledToken !== reloadToken;
  return { settled, error, loaded, clearError, refresh, reload, reloading };
}
