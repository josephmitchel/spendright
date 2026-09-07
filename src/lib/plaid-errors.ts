// Allow-listed Plaid error bodies: the five documented fields, picked one by
// one, never a whole `response.data` passed through. Dependency-free —
// client-bundleable. Design: error-message-allow-list, plaid-error-log-redaction.

export interface PlaidErrorFields {
  error_type?: string;
  error_code?: string;
  error_message?: string;
  display_message?: string | null;
  request_id?: string;
}

// The union stored on items.error (typed on the jsonb column): a picked
// Plaid error body, or the { message } shape the sync bookkeeping writes.
// Design: typed-api-contract.
export type ItemErrorBody = PlaidErrorFields | { message: string };

// Runtime-checked, not just picked: the input is a cast over an unvalidated
// response body, and a non-string would be stored and rendered.
const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

// Plaid's error body, or null if this is not a Plaid SDK failure. error_code
// identifies the shape — `response.data` alone matches other libraries.
// Design: error-message-allow-list.
export function plaidErrorBody(err: unknown): PlaidErrorFields | null {
  const data = (err as { response?: { data?: PlaidErrorFields } })?.response?.data;
  if (typeof data?.error_code !== 'string' || !data.error_code) return null;
  return pickPlaidErrorFields(data);
}

function pickPlaidErrorFields(data: PlaidErrorFields): PlaidErrorFields {
  return {
    error_type: asString(data.error_type),
    error_code: asString(data.error_code),
    error_message: asString(data.error_message),
    display_message: data.display_message === null ? null : asString(data.display_message),
    request_id: asString(data.request_id),
  };
}

// Plaid's own wording when it offered any, else the caller's fallback.
// Guarded per field: stored bodies predating the runtime checks may hold
// non-strings, and this renders straight into the page.
export function plaidErrorMessage(
  body: { display_message?: string | null; error_message?: string },
  fallback: string,
): string {
  return asString(body.display_message) || asString(body.error_message) || fallback;
}
