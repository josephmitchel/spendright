// Log helpers that redact caught errors. Axios hangs the full request config
// off the error — secret headers and request bodies included — so a raw
// Plaid error must never be printed (Verified-on: axios@1.20.0).
// Design: plaid-error-log-redaction.
import { plaidErrorBody } from '@/lib/plaid-errors';

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

// Fatal log + exit for the fail-closed startup paths. process.exit() drops
// stderr writes still queued, so the exit waits for the queue to drain.
export function logFatalAndExit(message: string, err?: unknown): void {
  logError(message, err);
  process.exitCode = 1;
  process.stderr.write('', () => process.exit(1));
}

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
