// Client-side response reader; the only way components read API bodies.
// Design: single-response-reader. No server imports — bundled into client code.
import { logError } from '@/lib/log';

// The one rendering of a caught client-side failure: the Error's own message
// (readJson only throws messages that came through the server's allow-listed
// envelope or a caller's fallback), else the caller's fallback.
export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

// A non-JSON body (Next's HTML error page, a proxy 502) must not surface as a
// SyntaxError; `failureMessage` is used when the response carries no JSON
// error. T is the route's response type from src/lib/api-types.ts — the type
// is asserted, not validated: the server is this same app.
export async function readJson<T>(res: Response, failureMessage: string): Promise<T> {
  const data = await res.json().catch(() => undefined);
  if (!res.ok) {
    // Checked, not just truthy: a non-string here would stringify into a
    // nonsense Error message instead of the fallback.
    const message: unknown = data?.error?.message;
    throw new Error(typeof message === 'string' && message ? message : failureMessage);
  }
  // `== null`: a body of JSON `null` is unreadable too, not a good body.
  if (data == null) throw new Error(`${failureMessage}: unreadable response`);
  return data as T;
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
