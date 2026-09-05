// Log-safe view of a caught error. The Plaid SDK throws axios errors, and
// axios hangs the full request config off the error — the PLAID-SECRET
// header and, for token-bearing calls, the decrypted access_token in the
// request body — so printing a raw Plaid error leaks both into the log.
// Dependency-free (no next/server import) so scripts can use it too.
// Design: plaid-error-log-redaction.

interface PlaidErrorFields {
  error_type?: unknown;
  error_code?: unknown;
  error_message?: unknown;
  display_message?: unknown;
  request_id?: unknown;
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
    plaid: data?.error_code
      ? {
          error_type: data.error_type,
          error_code: data.error_code,
          error_message: data.error_message,
          display_message: data.display_message,
          request_id: data.request_id,
        }
      : undefined,
  };
}
