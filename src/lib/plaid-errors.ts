
export interface PlaidErrorFields {
  error_type?: string;
  error_code?: string;
  error_message?: string;
  display_message?: string | null;
  request_id?: string;
}

export type ItemErrorBody = PlaidErrorFields | { message: string };

// { message } bodies are app-internal notices; only Plaid-reported errors are
// candidates for Link update-mode repair.
export function isPlaidItemError(error: ItemErrorBody): error is PlaidErrorFields {
  return !('message' in error);
}

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

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

export function plaidErrorMessage(
  body: { display_message?: string | null; error_message?: string },
  fallback: string,
): string {
  return asString(body.display_message) || asString(body.error_message) || fallback;
}
