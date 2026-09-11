// Monetary values render through Intl so they read unambiguously (grouping,
// currency-appropriate decimals) instead of as raw serialized numerics, and a
// missing value renders as '—' so it can't be mistaken for zero. The currency
// code always comes from the row, never an assumed default. Formatters are
// cached per currency — construction is the expensive part and this runs per
// row on every poll.
const currencyFormatters = new Map<string, Intl.NumberFormat>();
let plainFormatter: Intl.NumberFormat | null = null;

function currencyFormatter(currencyCode: string): Intl.NumberFormat {
  const cached = currencyFormatters.get(currencyCode);
  if (cached) return cached;
  const created = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currencyCode,
    currencyDisplay: 'narrowSymbol',
  });
  currencyFormatters.set(currencyCode, created);
  return created;
}

export function formatMoney(amount: string | number | null, currencyCode: string | null): string {
  if (amount == null) return '—';
  const value = Number(amount);
  if (!Number.isFinite(value)) return String(amount);
  if (currencyCode) {
    try {
      return currencyFormatter(currencyCode).format(value);
    } catch {
      // Unofficial codes (crypto, points) aren't valid ISO 4217 — fall through.
    }
  }
  plainFormatter ??= new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const formatted = plainFormatter.format(value);
  return currencyCode ? `${formatted} ${currencyCode}` : formatted;
}

// Plaid populates exactly one of the two currency fields.
export function rowCurrency(row: {
  isoCurrencyCode: string | null;
  unofficialCurrencyCode: string | null;
}): string | null {
  return row.isoCurrencyCode ?? row.unofficialCurrencyCode;
}
