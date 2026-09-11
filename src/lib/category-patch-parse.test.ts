import { describe, expect, it } from 'vitest';
import { isValidId, parseCategoryPatch } from '@/lib/category-patch-parse';

const MAX_INT32 = 2147483647;

describe('parseCategoryPatch', () => {
  it.each([null, undefined, 'body', 42, true, [1]])('rejects non-object body %j', (body) => {
    expect(parseCategoryPatch(body)).toEqual({
      ok: false,
      message: 'Request body must be a JSON object',
    });
  });

  it('rejects a body with neither category key', () => {
    expect(parseCategoryPatch({ other: 1 })).toEqual({
      ok: false,
      message: 'Provide exactly one of cardCategoryId or creditCategoryId',
    });
  });

  it('rejects a body with both category keys', () => {
    expect(parseCategoryPatch({ cardCategoryId: 1, creditCategoryId: 2 })).toEqual({
      ok: false,
      message: 'Provide exactly one of cardCategoryId or creditCategoryId',
    });
  });

  it.each([0, -1, 1.5, '3', NaN, MAX_INT32 + 1, null])('rejects the invalid id %j', (id) => {
    expect(parseCategoryPatch({ cardCategoryId: id })).toEqual({
      ok: false,
      message: 'cardCategoryId must be a positive integer',
    });
  });

  it('accepts a card category pick', () => {
    expect(parseCategoryPatch({ cardCategoryId: 7 })).toEqual({
      ok: true,
      kind: 'card',
      categoryId: 7,
    });
  });

  it('accepts a credit category pick at the int32 boundary', () => {
    expect(parseCategoryPatch({ creditCategoryId: MAX_INT32 })).toEqual({
      ok: true,
      kind: 'credit',
      categoryId: MAX_INT32,
    });
  });
});

describe('isValidId', () => {
  it('bounds ids to [1, int32 max]', () => {
    expect(isValidId(1)).toBe(true);
    expect(isValidId(MAX_INT32)).toBe(true);
    expect(isValidId(0)).toBe(false);
    expect(isValidId(MAX_INT32 + 1)).toBe(false);
    expect(isValidId('1')).toBe(false);
  });
});
