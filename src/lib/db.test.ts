import { describe, expect, it } from 'vitest';

// db.ts builds its pool from DATABASE_URL at module load; no query is ever
// issued here, the URL just has to parse.
process.env.DATABASE_URL ??= 'postgresql://localhost:5432/spendright';
const { isTransientConnectError } = await import('@/lib/db');

describe('isTransientConnectError', () => {
  it.each(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', '57P03'])(
    'treats %s as transient (retried while Postgres boots)',
    (code) => {
      expect(isTransientConnectError({ code })).toBe(true);
    },
  );

  it('treats the pg-pool connect timeout (message-only, no code) as transient', () => {
    expect(isTransientConnectError(new Error('timeout exceeded when trying to connect'))).toBe(
      true,
    );
  });

  it('treats an auth failure as fatal config', () => {
    // 28P01 invalid_password.
    expect(isTransientConnectError({ code: '28P01' })).toBe(false);
  });

  it('treats codeless and non-object errors as fatal', () => {
    expect(isTransientConnectError(new Error('something else'))).toBe(false);
    expect(isTransientConnectError('ECONNREFUSED')).toBe(false);
    expect(isTransientConnectError(null)).toBe(false);
  });
});
