// Log-safe view of a caught error. The Plaid SDK throws axios errors, and
// axios hangs the full request config off the error — the PLAID-SECRET
// header and, for token-bearing calls, the decrypted access_token in the
// request body — so printing a raw Plaid error leaks both into the log.
// Dependency-free (no next/server import) so scripts can use it too.
// Design: plaid-error-log-redaction.
import { pickPlaidErrorFields, type PlaidErrorFields } from '@/lib/plaid-errors';

// The one way a caught error is logged. Redaction is unconditional rather
// than a per-call-site habit: whether a site can see a Plaid error is a
// property of today's call graph, not anything checked, so every site pays
// the (free) loggableError pass. Design: plaid-error-log-redaction.
export function logError(message: string, err: unknown): void {
  console.error(message, loggableError(err));
}

export function loggableError(err: unknown): unknown {
  const axiosErr = err as {
    isAxiosError?: boolean;
    message?: string;
    response?: { status?: number; data?: PlaidErrorFields };
  } | null;
  if (typeof axiosErr !== 'object' || axiosErr === null || axiosErr.isAxiosError !== true) {
    return err;
  }
  // The axios message ("Request failed with status code 400") and Plaid's
  // error body are safe; everything else on the error is not.
  const data = axiosErr.response?.data;
  return {
    name: 'AxiosError',
    message: axiosErr.message,
    status: axiosErr.response?.status,
    plaid: data?.error_code ? pickPlaidErrorFields(data) : undefined,
  };
}
