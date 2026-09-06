// Client-side response reader; the only way components read API bodies.
// Design: single-response-reader. No server imports — bundled into client code.

// A non-JSON body (Next's HTML error page, a proxy 502) must not surface as a
// SyntaxError; `failureMessage` is used when the response carries no JSON
// error. T is the route's response type from src/lib/api-types.ts — the type
// is asserted, not validated: the server is this same app.
export async function readJson<T>(res: Response, failureMessage: string): Promise<T> {
  const data = await res.json().catch(() => undefined);
  if (!res.ok) throw new Error(data?.error?.message || failureMessage);
  // `== null`: a body of JSON `null` is unreadable too, not a good body.
  if (data == null) throw new Error(`${failureMessage}: unreadable response`);
  return data as T;
}

// Folds a load's allSettled failures into one on-screen message (null when
// nothing failed), logging each. Design: partial-load-rendering.
export function joinedFailureMessage(results: PromiseSettledResult<unknown>[]): string | null {
  const failures = results.filter(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  for (const failure of failures) console.error(failure.reason);
  if (failures.length === 0) return null;
  return failures
    .map((failure) => (failure.reason instanceof Error ? failure.reason.message : 'Failed to load'))
    .join('; ');
}
