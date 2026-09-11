import { NextResponse } from 'next/server';
import { logError } from '@/lib/log';
import { pgErrorCode } from '@/lib/pg-errors';
import { plaidErrorBody, plaidErrorMessage } from '@/lib/plaid-errors';
import { PublicError } from '@/lib/public-error';

export function jsonError(code: string, message: string, status: number): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

export function badRequest(message: string): NextResponse {
  return jsonError('BAD_REQUEST', message, 400);
}

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

export function publicErrorMessage(err: unknown, fallback: string): string {
  return allowListedError(err)?.message ?? fallback;
}

function errorResponse(err: unknown): NextResponse {
  const known = allowListedError(err);
  if (known?.expected) return jsonError(known.code, known.message, known.status);

  logError('request failed:', err);
  if (known) return jsonError(known.code, known.message, known.status);

  // 55P03 lock_not_available, 40P01 deadlock_detected — retryable.
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
