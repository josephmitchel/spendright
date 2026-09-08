// Design: money-formatted-with-intl.
// Monetary values render through Intl so they read unambiguously (grouping,
// currency-appropriate decimals) instead of as raw serialized numerics, and a
// missing value renders as '—' so it can't be mistaken for zero. The currency
// code always comes from the row, never an assumed default.
export function formatMoney(
  amount: string | number | null,
  currencyCode: string | null,
): string {
  if (amount == null) return '—';
  const value = Number(amount);
  if (!Number.isFinite(value)) return String(amount);
  if (currencyCode) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: currencyCode,
        currencyDisplay: 'narrowSymbol',
      }).format(value);
    } catch {
      // Unofficial codes (crypto, points) aren't valid ISO 4217 — fall through.
    }
  }
  const formatted = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
  return currencyCode ? `${formatted} ${currencyCode}` : formatted;
}

// Plaid populates exactly one of the two currency fields.
export function rowCurrency(row: {
  isoCurrencyCode: string | null;
  unofficialCurrencyCode: string | null;
}): string | null {
  return row.isoCurrencyCode ?? row.unofficialCurrencyCode;
}
