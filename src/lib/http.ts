
export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

const REQUEST_TIMEOUT_MS = 120_000;

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
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }).catch(
    (err: unknown) => {
      throw new Error(failureMessage, { cause: err });
    },
  );
  return readJson<T>(res, failureMessage);
}

async function readJson<T>(res: Response, failureMessage: string): Promise<T> {
  const data = await res.json().catch(() => undefined);
  if (!res.ok) {
    const message: unknown = data?.error?.message;
    throw new Error(typeof message === 'string' && message ? message : failureMessage);
  }
  if (data == null) throw new Error(`${failureMessage}: unreadable response`);
  return data as T;
}
