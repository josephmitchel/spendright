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

export function pickPlaidErrorFields(data: PlaidErrorFields): PlaidErrorFields {
  return {
    error_type: data.error_type,
    error_code: data.error_code,
    error_message: data.error_message,
    display_message: data.display_message,
    request_id: data.request_id,
  };
}

// Plaid's own wording when it offered any, else the caller's fallback.
export function plaidErrorMessage(
  body: { display_message?: string | null; error_message?: string },
  fallback: string,
): string {
  return body.display_message || body.error_message || fallback;
}
