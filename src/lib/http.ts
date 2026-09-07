// Client-side request/response helpers. Design: single-response-reader.
// No server imports — bundled into client code.

// A caught failure's rendering: the Error's own message, else the fallback.
export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

// Last-resort deadline on every component fetch; the abort surfaces as a
// normal failed read. Design: requests-have-deadlines.
const REQUEST_TIMEOUT_MS = 120_000;

// The two request shapes components use; both read through readJson below.
export async function getJson<T>(url: string, failureMessage: string): Promise<T> {
  return requestJson<T>(url, {}, failureMessage);
}

export async function sendJson<T>(
  url: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body: unknown,
  failureMessage: string,
): Promise<T> {
  return requestJson<T>(
    url,
    {
      method,
      ...(body !== undefined
        ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
        : {}),
    },
    failureMessage,
  );
}

async function requestJson<T>(url: string, init: RequestInit, failureMessage: string): Promise<T> {
  // The thrown message stays the caller's fallback; the network-level
  // failure rides along as `cause`. Design: requests-have-deadlines.
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }).catch(
    (err: unknown) => {
      throw new Error(failureMessage, { cause: err });
    },
  );
  return readJson<T>(res, failureMessage);
}

// Not exported (design: single-response-reader). A non-JSON body (an HTML
// error page, a proxy 502) must not surface as a SyntaxError. T is asserted,
// not validated: the server is this same app.
async function readJson<T>(res: Response, failureMessage: string): Promise<T> {
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
