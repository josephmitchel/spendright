import 'server-only';

import { DrizzleQueryError } from 'drizzle-orm/errors';
import { pgErrorCode } from '@/lib/pg-errors';

// pgErrorCode walks `cause` to find the pg SQLSTATE that drives the documented
// 55P03/40P01 → LOCKED 503 and 23503 → 409 mappings. This round-trips a real
// DrizzleQueryError at startup so a drizzle-orm/pg bump that stops hanging the
// driver error off `cause` fails loudly instead of silently degrading those
// mappings to generic 500s.
const CANARY_SQLSTATE = '55P03';

export function assertPgErrorExtraction(): void {
  const driverError = Object.assign(new Error('synthetic pg shape probe'), {
    code: CANARY_SQLSTATE,
  });
  const wrapped = new DrizzleQueryError('select 1', [], driverError);
  if (pgErrorCode(wrapped) !== CANARY_SQLSTATE) {
    throw new Error(
      'pg error extraction failed — pgErrorCode no longer finds the SQLSTATE on the installed ' +
        "drizzle-orm's query error; re-verify src/lib/pg-errors.ts against the installed " +
        'drizzle-orm version',
    );
  }
}
