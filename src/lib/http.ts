// Client-side response reader; the only way components read API bodies.
// Design: single-response-reader. No server imports — bundled into client code.

// The one rendering of a caught client-side failure: the Error's own message
// (readJson only throws messages that came through the server's allow-listed
// envelope or a caller's fallback), else the caller's fallback.
export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

// The two request shapes components use, so the fetch incantation (and any
// future cross-cutting addition — a timeout, a header) lives here rather
// than at every call site. Both read through readJson below.
export async function getJson<T>(url: string, failureMessage: string): Promise<T> {
  return readJson<T>(await fetch(url), failureMessage);
}

export async function sendJson<T>(
  url: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body: unknown,
  failureMessage: string,
): Promise<T> {
  const res = await fetch(url, {
    method,
    ...(body !== undefined
      ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      : {}),
  });
  return readJson<T>(res, failureMessage);
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
