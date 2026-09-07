// Log-safe view of a caught error. The Plaid SDK throws axios errors, and
// axios hangs the full request config off the error — the PLAID-SECRET
// header and, for token-bearing calls, the decrypted access_token in the
// request body — so printing a raw Plaid error leaks both into the log.
// Verified-on: axios@1.20.0.
// Dependency-free (no next/server import) so scripts can use it too.
// Design: plaid-error-log-redaction.
import { plaidErrorBody } from '@/lib/plaid-errors';

// Redaction is unconditional: every site that passes an error pays the
// (free) loggableError pass. Design: plaid-error-log-redaction.
export function logError(message: string, err?: unknown): void {
  if (err === undefined) console.error(message);
  else console.error(message, loggableError(err));
}

export function logWarn(message: string, err?: unknown): void {
  if (err === undefined) console.warn(message);
  else console.warn(message, loggableError(err));
}

export function logInfo(message: string): void {
  console.log(message);
}

// Fatal log + exit for the fail-closed startup paths. console.error to a
// pipe or file is asynchronous and process.exit() drops pending writes, so
// exiting in the same tick can lose the one message that explains the death;
// the exit is deferred until stderr's queue drains (the trailing empty write
// settles after everything queued before it).
export function logFatalAndExit(message: string, err?: unknown): void {
  logError(message, err);
  process.exitCode = 1;
  process.stderr.write('', () => process.exit(1));
}

// Not exported: exporting the redaction pass alone would invite bypassing it.
function loggableError(err: unknown): unknown {
  const axiosErr = err as {
    isAxiosError?: boolean;
    message?: string;
    response?: { status?: number };
  } | null;
  if (typeof axiosErr !== 'object' || axiosErr === null || axiosErr.isAxiosError !== true) {
    return err;
  }
  // Only the axios message, status, and the picked Plaid body are safe to
  // log; everything else on the error is not.
  return {
    name: 'AxiosError',
    message: axiosErr.message,
    status: axiosErr.response?.status,
    plaid: plaidErrorBody(err) ?? undefined,
  };
}
