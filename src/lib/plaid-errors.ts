// The structural allow-list for Plaid error bodies: the five documented
// fields, picked one by one, never a whole `response.data` passed through.
// This is the single definition of the field set and of the user-facing
// message precedence; src/lib/errors.ts, src/lib/log.ts and the client's
// item-error rendering all read through it. Dependency-free (no next/server,
// no db) so scripts and client bundles can import it.
// Design: error-message-allow-list, plaid-error-log-redaction.

export interface PlaidErrorFields {
  error_type?: string;
  error_code?: string;
  error_message?: string;
  display_message?: string | null;
  request_id?: string;
}

// The closed union stored on items.error: a picked Plaid error body, or the
// { message } shape the sync bookkeeping writes. Typed on the jsonb column so
// the writers (src/lib/sync.ts) and the client's item-error rendering cannot
// drift apart silently. Design: typed-api-contract.
export type ItemErrorBody = PlaidErrorFields | { message: string };

// The input type is a cast over an unvalidated response body, so each value
// is type-checked at runtime as well as picked: a non-string here would be
// stored on items.error and rendered as a React child.
const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

export function pickPlaidErrorFields(data: PlaidErrorFields): PlaidErrorFields {
  return {
    error_type: asString(data.error_type),
    error_code: asString(data.error_code),
    error_message: asString(data.error_message),
    display_message: data.display_message === null ? null : asString(data.display_message),
    request_id: asString(data.request_id),
  };
}

// Plaid's own wording when it offered any, else the caller's fallback.
// Guarded per field: stored bodies predating the runtime checks above may
// hold non-strings, and this renders straight into the page.
export function plaidErrorMessage(
  body: { display_message?: string | null; error_message?: string },
  fallback: string,
): string {
  return asString(body.display_message) || asString(body.error_message) || fallback;
}
