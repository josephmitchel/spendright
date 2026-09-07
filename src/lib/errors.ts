import { NextResponse } from 'next/server';
import { logError } from '@/lib/log';
import { pgErrorCode } from '@/lib/pg-errors';
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

// Wraps a route handler so anything it throws maps through the allow-list.
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
