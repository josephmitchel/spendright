import { NextResponse } from 'next/server';
import { loggableError } from '@/lib/log';
import { pickPlaidErrorFields, plaidErrorMessage, type PlaidErrorFields } from '@/lib/plaid-errors';

// The single constructor of the `{ error: { code, message } }` envelope, for
// thrown paths (errorResponse below) and returned paths (routes) alike.
// Design: error-message-allow-list.
export function jsonError(code: string, message: string, status: number): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

export function badRequest(message: string): NextResponse {
  return jsonError('BAD_REQUEST', message, 400);
}

// Plaid's error body, or null if this is not a Plaid SDK failure. error_code
// is what identifies the shape; `response.data` alone matches other libraries.
// The fields are picked, never passed through whole: callers store this object
// on items.error and GET /api/items serves it, so the allow-list must be
// structural rather than trust whatever Plaid's response happens to carry.
// Design: error-message-allow-list.
export function plaidErrorBody(err: unknown): PlaidErrorFields | null {
  const data = (err as { response?: { data?: PlaidErrorFields } })?.response?.data;
  if (!data?.error_code) return null;
  return pickPlaidErrorFields(data);
}

// An error whose message is safe to show to the user. Design:
// error-message-allow-list. Never construct one from a caught error's message.
export class PublicError extends Error {
  status: number;
  code: string;
  constructor(message: string, options?: { status?: number; code?: string }) {
    super(message);
    this.status = options?.status ?? 500;
    this.code = options?.code ?? 'INTERNAL';
  }
}

// Same allow-list as errorResponse, for callers that store the message
// (items.error) instead of returning it.
export function publicErrorMessage(err: unknown, fallback: string): string {
  const plaid = plaidErrorBody(err);
  if (plaid) return plaidErrorMessage(plaid, 'Plaid error');
  if (err instanceof PublicError) return err.message;
  return fallback;
}

// Postgres SQLSTATE for an error thrown under a drizzle query. drizzle wraps
// the pg error in a DrizzleQueryError and hangs it off `cause`, so the chain
// is walked. Node errno codes like EPIPE are also five [0-9A-Z] chars but no
// SQLSTATE class starts with E, so they are screened out.
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

export function errorResponse(err: unknown): NextResponse {
  // 4xx PublicErrors are ordinary rejections (validation, not-found, sign
  // rules) — part of normal operation, so not logged as server failures.
  // 5xx PublicErrors (BAD_CONFIG, NOT_READY) fall through to the log below.
  if (err instanceof PublicError && err.status < 500) {
    return jsonError(err.code, err.message, err.status);
  }

  // Redacted: a raw Plaid error carries the client secret and the
  // decrypted access token in its axios config. Design: plaid-error-log-redaction.
  console.error(loggableError(err));

  const plaidError = plaidErrorBody(err);
  if (plaidError) {
    return jsonError(
      plaidError.error_code ?? 'PLAID',
      plaidErrorMessage(plaidError, 'Plaid error'),
      502,
    );
  }

  if (err instanceof PublicError) {
    return jsonError(err.code, err.message, err.status);
  }

  // App-wide, not route-specific: any route that writes under a lock can lose
  // to a running sync or seed run. 55P03 lock_not_available (lock_timeout
  // expired) and 40P01 deadlock_detected are both retryable.
  const code = pgErrorCode(err);
  if (code === '55P03' || code === '40P01') {
    return jsonError(
      'LOCKED',
      'This record is being synced right now — try again in a moment',
      503,
    );
  }

  // Never echo err.message: drizzle's carries the SQL and bound parameters.
  return jsonError('INTERNAL', 'Internal server error', 500);
}
