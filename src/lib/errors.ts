import { NextResponse } from 'next/server';
import { loggableError } from '@/lib/log';

interface PlaidErrorBody {
  error_type?: string;
  error_code?: string;
  error_message?: string;
  display_message?: string | null;
  request_id?: string;
}

// Plaid's error body, or null if this is not a Plaid SDK failure. error_code
// is what identifies the shape; `response.data` alone matches other libraries.
// The fields are picked, never passed through whole: callers store this object
// on items.error and GET /api/items serves it, so the allow-list must be
// structural rather than trust whatever Plaid's response happens to carry.
// Design: error-message-allow-list.
export function plaidErrorBody(err: unknown): PlaidErrorBody | null {
  const data = (err as { response?: { data?: PlaidErrorBody } })?.response?.data;
  if (!data?.error_code) return null;
  return {
    error_type: data.error_type,
    error_code: data.error_code,
    error_message: data.error_message,
    display_message: data.display_message,
    request_id: data.request_id,
  };
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
  if (plaid) return plaid.display_message || plaid.error_message || 'Plaid error';
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
  // Redacted: a raw Plaid error carries the client secret and the
  // decrypted access token in its axios config. Design: plaid-error-log-redaction.
  console.error(loggableError(err));

  const plaidError = plaidErrorBody(err);
  if (plaidError) {
    return NextResponse.json(
      {
        error: {
          code: plaidError.error_code,
          message: plaidError.display_message || plaidError.error_message || 'Plaid error',
        },
      },
      { status: 502 },
    );
  }

  if (err instanceof PublicError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message } },
      { status: err.status },
    );
  }

  // Never echo err.message: drizzle's carries the SQL and bound parameters.
  return NextResponse.json(
    { error: { code: 'INTERNAL', message: 'Internal server error' } },
    { status: 500 },
  );
}
