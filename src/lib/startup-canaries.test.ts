import { describe, expect, it } from 'vitest';
import { assertPgErrorExtraction } from '@/lib/pg-error-check';
import { assertPlaidErrorExtraction, assertPlaidRetryShape } from '@/lib/plaid-error-check';
import { assertDateParserPassthrough } from '@/lib/pool-config';
import { assertAxiosErrorRedaction } from '@/lib/redaction-check';

// These canaries otherwise run only at real server boot; running them here
// makes `npm test` (and prebuild) catch a dependency bump that changes an
// error/date shape before a deploy does.
describe('startup dependency-shape canaries', () => {
  it('axios error redaction still strips the Plaid secret', () => {
    expect(() => assertAxiosErrorRedaction()).not.toThrow();
  });

  it('Plaid error body extraction still matches the SDK shape', () => {
    expect(() => assertPlaidErrorExtraction()).not.toThrow();
  });

  it('Plaid retry classification still matches the SDK shape', () => {
    expect(() => assertPlaidRetryShape()).not.toThrow();
  });

  it('pg error code extraction still matches the driver shape', () => {
    expect(() => assertPgErrorExtraction()).not.toThrow();
  });

  it('the pg date parser still passes dates through as strings', () => {
    expect(() => assertDateParserPassthrough()).not.toThrow();
  });
});
