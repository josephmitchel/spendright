import { describe, expect, it } from 'vitest';
import { assertNeverKind, categoryKindKeys, kindForAmount } from '@/lib/category-kinds';

describe('kindForAmount', () => {
  it('classifies negative amounts as credit', () => {
    expect(kindForAmount(-0.01)).toBe('credit');
    expect(kindForAmount('-5.00')).toBe('credit');
  });

  it('classifies positive amounts as card', () => {
    expect(kindForAmount(12.34)).toBe('card');
    expect(kindForAmount('12.34')).toBe('card');
  });

  it('counts zero as spend (card)', () => {
    expect(kindForAmount(0)).toBe('card');
    expect(kindForAmount('0')).toBe('card');
    expect(kindForAmount('-0')).toBe('card');
  });

  it('counts NaN as spend (card)', () => {
    expect(kindForAmount('not-a-number')).toBe('card');
    expect(kindForAmount(Number.NaN)).toBe('card');
  });
});

describe('categoryKindKeys', () => {
  it('card writes its id and the rate snapshot', () => {
    expect(categoryKindKeys.card.id).toBe('cardCategoryId');
    expect(categoryKindKeys.card.writeColumns).toEqual(['cardCategoryId', 'rewardRate']);
  });

  it('credit writes only its id (credit categories are rate-less)', () => {
    expect(categoryKindKeys.credit.id).toBe('creditCategoryId');
    expect(categoryKindKeys.credit.writeColumns).toEqual(['creditCategoryId']);
  });
});

describe('assertNeverKind', () => {
  it('throws naming the unexpected kind', () => {
    expect(() => assertNeverKind('points' as never)).toThrow('Unhandled category kind: points');
  });
});
