// Axios hangs the full request config, secret headers included, off its
// errors (Verified-on: axios@1.20.0).
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

// process.exit() drops queued stderr writes, so the exit waits for the drain.
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
  return {
    name: 'AxiosError',
    message: axiosErr.message,
    status: axiosErr.response?.status,
    plaid: plaidErrorBody(err) ?? undefined,
  };
}
