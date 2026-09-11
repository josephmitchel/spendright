import { describe, expect, it } from 'vitest';
import { formatMoney, rowCurrency } from '@/lib/money';

// Expected values come from the same Intl APIs so assertions hold in any
// runtime locale.
const currency = (value: number, code: string) =>
  new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: code,
    currencyDisplay: 'narrowSymbol',
  }).format(value);

const plain = (value: number) =>
  new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

describe('formatMoney', () => {
  it('renders null as an em dash so missing never reads as zero', () => {
    expect(formatMoney(null, 'USD')).toBe('—');
    expect(formatMoney(null, null)).toBe('—');
  });

  it('formats a valid ISO code as currency', () => {
    expect(formatMoney('1234.5', 'USD')).toBe(currency(1234.5, 'USD'));
    expect(formatMoney(-12, 'EUR')).toBe(currency(-12, 'EUR'));
  });

  it('falls back to plain decimals plus the code for non-ISO codes', () => {
    expect(formatMoney('1234.5', 'POINTS')).toBe(`${plain(1234.5)} POINTS`);
  });

  it('formats plain decimals with no suffix when there is no code', () => {
    expect(formatMoney('5', null)).toBe(plain(5));
  });

  it('renders an unparseable numeric verbatim rather than corrupting it', () => {
    expect(formatMoney('12,34', null)).toBe('12,34');
    expect(formatMoney(Number.POSITIVE_INFINITY, 'USD')).toBe('Infinity');
  });
});

describe('rowCurrency', () => {
  it('prefers the ISO code, falls back to the unofficial one', () => {
    expect(rowCurrency({ isoCurrencyCode: 'USD', unofficialCurrencyCode: 'BTC' })).toBe('USD');
    expect(rowCurrency({ isoCurrencyCode: null, unofficialCurrencyCode: 'BTC' })).toBe('BTC');
    expect(rowCurrency({ isoCurrencyCode: null, unofficialCurrencyCode: null })).toBeNull();
  });
});
