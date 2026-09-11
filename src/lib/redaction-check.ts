import 'server-only';

import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { loggableError } from '@/lib/log';

// loggableError duck-types the installed axios's error shape to keep
// PLAID-SECRET (riding on error.config) out of the server log. axios is pinned
// (package.json overrides), and this round-trips a real AxiosError from the
// installed version at startup so a bump that changes the shape fails loudly
// instead of silently leaking.
const CANARY = 'redaction-canary-plaid-secret';

export function assertAxiosErrorRedaction(): void {
  const config = { headers: { 'PLAID-SECRET': CANARY } } as unknown as InternalAxiosRequestConfig;
  const synthetic = new AxiosError('synthetic redaction probe', 'ESYNTHETIC', config);
  const serialized = JSON.stringify(loggableError(synthetic));
  if (serialized === undefined || serialized.includes(CANARY)) {
    throw new Error(
      'axios error redaction failed — loggableError would leak the request config (and its ' +
        'PLAID-SECRET header) to the server log; re-verify src/lib/log.ts against the ' +
        'installed axios version',
    );
  }
}
