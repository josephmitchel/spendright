import 'server-only';

import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios';
import { isTransientPlaidFailure, retryDelayMs } from '@/lib/plaid';
import { plaidErrorBody } from '@/lib/plaid-errors';

// plaidErrorBody duck-types the installed axios's error shape to pull the
// Plaid error body that drives client messages and repair-mode detection.
// axios is pinned; this round-trips a real AxiosError carrying a Plaid-shaped
// response at startup so a bump that moves the shape fails loudly instead of
// silently degrading every Plaid error to a generic 500.
const CANARY_CODE = 'PLAID_SHAPE_CANARY_CODE';
const CANARY_DISPLAY = 'plaid-shape-canary-display';

export function assertPlaidErrorExtraction(): void {
  const response = {
    data: {
      error_type: 'ITEM_ERROR',
      error_code: CANARY_CODE,
      error_message: 'synthetic plaid shape probe',
      display_message: CANARY_DISPLAY,
      request_id: 'synthetic',
    },
    status: 400,
  } as AxiosResponse;
  const synthetic = new AxiosError(
    'synthetic plaid shape probe',
    'ESYNTHETIC',
    undefined,
    undefined,
    response,
  );
  const body = plaidErrorBody(synthetic);
  if (body?.error_code !== CANARY_CODE || body.display_message !== CANARY_DISPLAY) {
    throw new Error(
      'Plaid error extraction failed — plaidErrorBody no longer reads the installed axios ' +
        'error shape; re-verify src/lib/plaid-errors.ts against the installed axios version',
    );
  }
}

// The one-bounded-retry policy duck-types the same axios error shape
// (isAxiosError, response.status, lower-cased response.headers as own
// properties). A bump that moves any of it would silently turn retry-on-5xx/429
// into no-retry-ever, so round-trip real AxiosError/AxiosHeaders instances at
// startup too.
export function assertPlaidRetryShape(): void {
  const throttled = new AxiosError(
    'synthetic retry shape probe',
    'ESYNTHETIC',
    undefined,
    undefined,
    {
      status: 429,
      headers: new AxiosHeaders({ 'retry-after': '7' }),
    } as AxiosResponse,
  );
  const denied = new AxiosError('synthetic retry shape probe', 'ESYNTHETIC', undefined, undefined, {
    status: 400,
    headers: new AxiosHeaders(),
  } as AxiosResponse);
  if (
    !isTransientPlaidFailure(throttled) ||
    isTransientPlaidFailure(denied) ||
    retryDelayMs(throttled) !== 7000
  ) {
    throw new Error(
      'Plaid retry-shape check failed — isTransientPlaidFailure/retryDelayMs no longer read ' +
        'the installed axios error shape; re-verify src/lib/plaid.ts against the installed ' +
        'axios version',
    );
  }
}
