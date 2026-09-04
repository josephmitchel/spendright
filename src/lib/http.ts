// Client-side response reader; the only way components read API bodies.
// Design: single-response-reader. No server imports — bundled into client code.

// A non-JSON body (Next's HTML error page, a proxy 502) must not surface as a
// SyntaxError; `failureMessage` is used when the response carries no JSON error.
export async function readJson(res: Response, failureMessage: string) {
  const data = await res.json().catch(() => undefined);
  if (!res.ok) throw new Error(data?.error?.message || failureMessage);
  // `== null`: a body of JSON `null` is unreadable too, not a good body.
  if (data == null) throw new Error(`${failureMessage}: unreadable response`);
  return data;
}
