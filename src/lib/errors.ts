import { NextResponse } from 'next/server';

interface PlaidErrorBody {
  error_code?: string;
  error_message?: string;
  display_message?: string | null;
}

// Plaid's own error body, or null if this is not a Plaid SDK failure.
// error_code is what identifies the shape: `response.data` on its own would
// also match any other library that hangs a response off its errors.
export function plaidErrorBody(err: unknown): PlaidErrorBody | null {
  const data = (err as { response?: { data?: PlaidErrorBody } })?.response?.data;
  return data?.error_code ? data : null;
}

// An error whose message was WRITTEN to be shown to a user. Throwing this is
// the only way an app-authored message reaches the client, and that is the
// point: errorResponse suppresses err.message by default because drizzle's
// carries the SQL and its bound parameters, and the first version of that
// suppression was a blanket one. It also blanked the app's own errors — most
// visibly src/lib/plaid.ts's "still preparing transactions", the one failure in
// this app the user can actually act on, which turned into "Internal server
// error" and told them nothing.
//
// An allow-list rather than a list of things to redact: a new throw site is
// opaque until someone decides its message is safe, which is the failure that
// costs a support question rather than a leak. Never construct one from a
// caught error's message — that is how the SQL gets back out.
export class PublicError extends Error {
  status: number;
  code: string;
  constructor(message: string, options?: { status?: number; code?: string }) {
    super(message);
    this.status = options?.status ?? 500;
    this.code = options?.code ?? 'INTERNAL';
  }
}

// The message for a caller that RECORDS an error instead of returning one —
// /api/sync and /api/exchange both store one on the item row. Same allow-list
// as errorResponse, in the same order, so a given failure reads the same way
// whether it comes back in a response or off items.error a day later.
export function publicErrorMessage(err: unknown, fallback: string): string {
  const plaid = plaidErrorBody(err);
  if (plaid) return plaid.display_message || plaid.error_message || 'Plaid error';
  if (err instanceof PublicError) return err.message;
  return fallback;
}

// Postgres SQLSTATE for an error thrown anywhere under a drizzle query.
// drizzle wraps EVERY query error in a DrizzleQueryError and hangs the original
// pg error off `cause` (see node_modules/drizzle-orm/errors.cjs), so the error a
// route catches carries no `code` of its own — reading `err.code` directly
// silently never matches. Walks the chain because a transaction can nest one
// wrapper inside another.
// Every SQLSTATE is exactly five characters of [0-9A-Z] — but so are plenty of
// Node errno codes (EPIPE, EPERM, EBUSY, EINTR, EROFS), and those are precisely
// the wrappers this walk has to see past, so the shape alone is not enough.
// Postgres defines no error class beginning with E (they run 00–0Z, 20–2F,
// 34–3F, 40–58, 72, F0, HV, P0, XX), so excluding the errno shape rejects
// nothing real.
const SQLSTATE = /^[0-9A-Z]{5}$/;
const NODE_ERRNO = /^E[A-Z]+$/;

export function pgErrorCode(err: unknown): string | undefined {
  let current: unknown = err;
  for (let depth = 0; current != null && typeof current === 'object' && depth < 5; depth++) {
    const code = (current as { code?: unknown }).code;
    // Shape-checked, not just typeof: `code` is a popular property name, and
    // taking the first string one would let a wrapper answer for the error it
    // wraps. Most competing codes are the wrong shape and fall through
    // harmlessly on their own — PublicError (defined ABOVE) defaults to
    // 'INTERNAL', and a socket failure's 'ECONNRESET' is ten characters — but
    // 'EPIPE' is exactly five of [0-9A-Z] and would pass for a SQLSTATE, which
    // is the whole reason NODE_ERRNO is screened out above. Nothing wraps a pg
    // error in one of those today, so this changes no current behaviour — but the first thing that
    // does would short-circuit the walk and turn a real 40P01/55P03/23503 into
    // an opaque 500, silently, which is the one failure mode the callers of
    // this function exist to prevent. Keep walking instead.
    if (typeof code === 'string' && SQLSTATE.test(code) && !NODE_ERRNO.test(code)) return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

export function errorResponse(err: unknown): NextResponse {
  console.error(err);

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

  // The second entry in the allow-list: a message the app wrote for the user.
  // See PublicError above for why this is opt-in.
  if (err instanceof PublicError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message } },
      { status: err.status },
    );
  }

  // Never echo err.message to the client. drizzle wraps every query failure in
  // a DrizzleQueryError whose message is `Failed query: <the full SQL>\nparams:
  // <the bound values>`, so returning it shipped the schema and the parameters
  // (account ids, transaction ids) to the browser on any unmapped DB error —
  // and the client renders error.message straight into an alert. The real error
  // is logged above, which is where a stack belongs anyway.
  //
  // A route that wants to tell the client something specific builds that
  // response itself rather than relaxing this: see the SQLSTATE branches in
  // src/app/api/transactions/[transactionId]/route.ts, or throw a PublicError
  // from where the failure is understood. Reaching here means nothing
  // recognized the error, and "internal error" is the honest answer.
  return NextResponse.json(
    { error: { code: 'INTERNAL', message: 'Internal server error' } },
    { status: 500 },
  );
}
