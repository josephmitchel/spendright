import { describe, expect, it } from 'vitest';
import { MAX_PAGE_LIMIT, PAGE_SIZE, readBound } from '@/lib/pagination';

describe('readBound', () => {
  it('parses an in-range value', () => {
    expect(readBound('5', PAGE_SIZE, 1, MAX_PAGE_LIMIT)).toBe(5);
  });

  it('falls back when the value is absent', () => {
    expect(readBound(null, PAGE_SIZE, 1, MAX_PAGE_LIMIT)).toBe(PAGE_SIZE);
  });

  it('falls back on non-numeric input', () => {
    expect(readBound('abc', PAGE_SIZE, 1, MAX_PAGE_LIMIT)).toBe(PAGE_SIZE);
  });

  it('falls back on zero and empty string (deliberate: zero takes the default)', () => {
    expect(readBound('0', PAGE_SIZE, 1, MAX_PAGE_LIMIT)).toBe(PAGE_SIZE);
    expect(readBound('', PAGE_SIZE, 1, MAX_PAGE_LIMIT)).toBe(PAGE_SIZE);
  });

  it('truncates decimals', () => {
    expect(readBound('5.9', PAGE_SIZE, 1, MAX_PAGE_LIMIT)).toBe(5);
  });

  it('clamps below the minimum', () => {
    expect(readBound('-3', PAGE_SIZE, 1, MAX_PAGE_LIMIT)).toBe(1);
    expect(readBound('-3', 0, 0, Number.MAX_SAFE_INTEGER)).toBe(0);
  });

  it('clamps above the maximum', () => {
    expect(readBound('2000', PAGE_SIZE, 1, MAX_PAGE_LIMIT)).toBe(MAX_PAGE_LIMIT);
  });
});
