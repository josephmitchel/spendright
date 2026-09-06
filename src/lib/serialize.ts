// Async coordination helpers — no server or framework imports (only the
// client-safe log/message helpers), so server modules and client hooks share
// one implementation of each idiom instead of hand-rolling it.
import { errorMessage } from '@/lib/http';
import { logError } from '@/lib/log';

// Chains `task` onto `key`'s tail: at most one task per key is in flight, and
// tasks settle strictly in submission order. The map entry self-cleans once
// the finished tail is still the newest (identity-checked, so a chain that
// grew in the meantime keeps its tail). The returned promise is the task's
// own — a rejection reaches the caller, never the chain.
export function serializeByKey<T>(
  tails: Map<string, Promise<void>>,
  key: string,
  task: () => Promise<T>,
): Promise<T> {
  const previous = tails.get(key) ?? Promise.resolve();
  const run = previous.then(task);
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  tails.set(key, tail);
  void tail.then(() => {
    if (tails.get(key) === tail) tails.delete(key);
  });
  return run;
}

// Single-flight: a caller that arrives while `slot.inFlight` is set joins
// that run instead of starting a duplicate. The slot lives with the caller so
// its lifetime (usually a process-wide singleton) stays the caller's choice.
export function singleFlight<T>(
  slot: { inFlight: Promise<T> | null },
  run: () => Promise<T>,
): Promise<T> {
  if (!slot.inFlight) {
    slot.inFlight = run().finally(() => {
      slot.inFlight = null;
    });
  }
  return slot.inFlight;
}

// Settles a keyed set of reads together, so one failure never discards a
// sibling that did arrive. `results` carries each read's typed outcome,
// `succeeded` is the per-read gate for messages that assert what the database
// holds, and `error` folds the failures (each also logged) into one on-screen
// message, null when nothing failed. Every data hook loads through this and
// exposes the same shape — `settled`, `error`, `clearError`, and a `loaded`
// object with one boolean per read — packaged by useLoadProtocol in
// src/components/useLoadProtocol.ts. Design: partial-load-rendering.
// The constraint is not Record<string, Promise<unknown>>: that would
// contextually type each read as Promise<unknown> and collapse the inferred
// value types; Awaited<T[K]> does the unwrapping instead.
export async function settleReads<T extends Record<string, unknown>>(
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
