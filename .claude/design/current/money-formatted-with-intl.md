---
name: money-formatted-with-intl
description: Monetary values render through one Intl-based formatter (formatMoney) with the row's own currency code, and a missing balance renders as '—' — number formatting is data correctness, outside the unstyled-for-now carve-out
tags: [formatMoney, rowCurrency, src/lib/money.ts, AccountsTable, AccountIdentity, TransactionTable, isoCurrencyCode, unofficialCurrencyCode]
date: 2026-09-07
---

Confirmed 2026-09-07: successive audits flagged that balances and amounts rendered as raw serialized numerics — no grouping, no currency, and a `null` balance printing as an empty cell indistinguishable from zero — and judged this data correctness rather than styling, so [[unstyled-for-now]] does not cover it. The user chose full formatting over deferral.

`formatMoney` (src/lib/money.ts) is the single formatter: `Intl.NumberFormat` with `style: 'currency'` and the row's own code via `rowCurrency` (`isoCurrencyCode ?? unofficialCurrencyCode` — Plaid populates exactly one), falling back to a plain two-decimal grouping plus the code appended when the code isn't valid ISO 4217 (crypto, points), and `'—'` for `null` so a missing value can't read as zero. An unparseable numeric renders verbatim rather than corrupting the value. The home page's `AccountsTable` gains a Currency column, closing the gap where the code was shown everywhere but there. Locale is the viewer's runtime locale (no argument), consistent with the existing `toLocaleString()` timestamps.
