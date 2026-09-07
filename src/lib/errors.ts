import { NextResponse, type NextRequest } from 'next/server';
import { logError } from '@/lib/log';
import { plaidErrorBody, plaidErrorMessage } from '@/lib/plaid-errors';
import { PublicError } from '@/lib/public-error';

// The `{ error: { code, message } }` envelope.
// Design: error-message-allow-list.
export function jsonError(code: string, message: string, status: number): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

export function badRequest(message: string): NextResponse {
  return jsonError('BAD_REQUEST', message, 400);
}

// The public allow-list: a PublicError speaks for itself, a recognized Plaid
// error through plaidErrorMessage, anything else is unknown (null).
// `expected` marks ordinary 4xx rejections, not logged as server failures.
// Design: error-message-allow-list.
function allowListedError(
  err: unknown,
): { code: string; message: string; status: number; expected: boolean } | null {
  if (err instanceof PublicError) {
    return { code: err.code, message: err.message, status: err.status, expected: err.status < 500 };
  }
  const plaid = plaidErrorBody(err);
  if (plaid) {
    return {
      code: plaid.error_code ?? 'PLAID',
      message: plaidErrorMessage(plaid, 'Plaid error'),
      status: 502,
      expected: false,
    };
  }
  return null;
}

// For callers that store the message (items.error) instead of returning it.
export function publicErrorMessage(err: unknown, fallback: string): string {
  return allowListedError(err)?.message ?? fallback;
}

// Postgres SQLSTATE for an error thrown under a drizzle query. drizzle wraps
// the pg error in a DrizzleQueryError and hangs it off `cause`
// (Verified-on: drizzle-orm@0.45.2), so the chain is walked. Node errno
// codes like EPIPE are also five [0-9A-Z] chars but no SQLSTATE class starts
// with E, so they are screened out.
const SQLSTATE = /^[0-9A-Z]{5}$/;
const NODE_ERRNO = /^E[A-Z]+$/;

export function pgErrorCode(err: unknown): string | undefined {
  let current: unknown = err;
  for (let depth = 0; current != null && typeof current === 'object' && depth < 5; depth++) {
    const code = (current as { code?: unknown }).code;
    // Shape-checked so a wrapper's own `code` cannot answer for the pg error.
    if (typeof code === 'string' && SQLSTATE.test(code) && !NODE_ERRNO.test(code)) return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

function errorResponse(err: unknown): NextResponse {
  const known = allowListedError(err);
  if (known?.expected) return jsonError(known.code, known.message, known.status);

  // Redacted: a raw Plaid error carries the client secret and the
  // decrypted access token in its axios config. Design: plaid-error-log-redaction.
  logError('request failed:', err);
  if (known) return jsonError(known.code, known.message, known.status);

  // 55P03 lock_not_available and 40P01 deadlock_detected are retryable: any
  // route writing under a lock can lose to a running sync or seed run.
  const code = pgErrorCode(err);
  if (code === '55P03' || code === '40P01') {
    return jsonError(
      'LOCKED',
      'This record is being synced right now — try again in a moment',
      503,
    );
  }

  // Never echo err.message: drizzle's carries the SQL and bound parameters
  // (Verified-on: drizzle-orm@0.45.2).
  return jsonError('INTERNAL', 'Internal server error', 500);
}

// Every route handler exports through this wrapper. A route needing its own
// error mapping keeps an inner try/catch and rethrows what it does not
// handle.
export function withErrorResponse<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse>,
): (...args: Args) => Promise<NextResponse> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

// Throws as PublicError so a bad body surfaces as a 400 through
// errorResponse.
export async function readJsonBody(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new PublicError('Request body must be valid JSON', { status: 400, code: 'BAD_REQUEST' });
  }
}
