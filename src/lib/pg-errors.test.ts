import { describe, expect, it } from 'vitest';
import { pgErrorCode } from '@/lib/pg-errors';

const withCause = (depth: number, leaf: object): object => {
  let current = leaf;
  for (let i = 0; i < depth; i++) current = { cause: current };
  return current;
};

describe('pgErrorCode', () => {
  it('reads a SQLSTATE straight off the error', () => {
    expect(pgErrorCode({ code: '55P03' })).toBe('55P03');
  });

  it('finds a SQLSTATE nested several cause levels deep', () => {
    expect(pgErrorCode(withCause(4, { code: '40P01' }))).toBe('40P01');
  });

  it('stops at the depth cap', () => {
    expect(pgErrorCode(withCause(5, { code: '55P03' }))).toBeUndefined();
  });

  it('rejects Node errno codes that superficially match the SQLSTATE shape', () => {
    // EPIPE is 5 chars of [0-9A-Z]; no SQLSTATE class starts with E-letter.
    expect(pgErrorCode({ code: 'EPIPE' })).toBeUndefined();
    expect(pgErrorCode({ code: 'ECONNRESET' })).toBeUndefined();
  });

  it('keeps walking past an errno to a nested SQLSTATE', () => {
    expect(pgErrorCode({ code: 'EPIPE', cause: { code: '57014' } })).toBe('57014');
  });

  it('returns undefined when no code exists anywhere', () => {
    expect(pgErrorCode(undefined)).toBeUndefined();
    expect(pgErrorCode(new Error('plain'))).toBeUndefined();
    expect(pgErrorCode(withCause(3, { message: 'no code' }))).toBeUndefined();
  });
});
