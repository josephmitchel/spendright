---
name: deferred-features
description: The features deliberately unbuilt at this stage, each with its rationale and revisit trigger — single-card catalog, Plaid's category reserved not rendered, reward aggregation, reward caps/tiers, and data export; audits must not re-flag them while their sections stand
tags:
  [
    src/db/cards.seed.ts,
    cardSeeds,
    transactions.category,
    personal_finance_category,
    src/lib/plaid.ts,
    GET /api/transactions,
    transactions.reward_rate,
    transactions.amount,
    card_categories.rate,
    src/db/schema.ts,
    rateCellText,
    TransactionTable.tsx,
    "data export",
    "data backup",
    src/app/api,
    "pg_dump extraction",
  ]
date: 2026-09-04
---

Each section below is a confirmed decision to *not* build something yet, with the reason and the trigger that reopens it. Audits should treat these as accepted decisions, not gaps.

## Single-card catalog (decided 2026-09-04)

`cardSeeds` contains one card (Amex Blue Cash Preferred). This is not an incomplete catalog. More cards are added once the single-card experience is settled. Do not flag the catalog as too small.

## Plaid category reserved, not rendered (decided 2026-09-04)

The ingest adapter in `src/lib/plaid.ts` derives `ProviderTransaction.category` from `personal_finance_category.primary` (falling back to legacy `category[0]`), the sync writes it into `transactions.category` ([[plaid-types-adapted-at-ingest]]), and `/api/transactions` returns it, but no UI surface shows it. It is kept for a future auto-categorization feature — decided 2026-09-04: that feature is planned but not being built now. The column and its presence in responses are deliberate, not dead weight.

## Reward aggregation deferred (confirmed 2026-09-07)

Three of four functional-suitability auditors in the 2026-09-07 audit flagged that the app's stated purpose ("credit card spending optimization") outruns what exists — `rewardRate` and `amount` are stored per transaction, but nothing multiplies, sums, or compares them anywhere, so only the data-collection half of the premise is implemented. The user confirmed this is a deliberate deferral, like the single-card catalog and reserved Plaid categories above: capture faithfully now, build the optimization surface once the single-card categorization flow is proven right. The per-transaction snapshot ([[categorization-is-a-historical-snapshot]]) is exactly what makes the deferred computation possible over history later. Companion deferral: reward caps below — rate modeling stays flat until aggregation exists to make caps computable. Audits should not re-flag the absence of aggregation, actual-vs-optimal comparison, or the app description's forward-looking framing while this section stands. Revisit trigger: the user calling the single-card flow validated, or a second card entering the catalog.

## Reward caps and tiers deferred (confirmed 2026-09-07)

The 2026-09-07 audit (functional suitability and safety both) flagged that `card_categories.rate` is a flat `numeric` with no cap/threshold concept, while the one seeded card's elevated categories really cap at an annual spend amount and then drop — so past the cap the displayed rate is wrong, in the exact figure the app's purpose rests on. The user confirmed deferring cap/tier modeling rather than building it now: a cap is only enforceable against _cumulative_ spend, which requires the aggregation machinery that is itself deferred (above) — a cap field without it would be stored but uncheckable, false precision rather than accuracy. The flat rate is understood as "the headline rate", not a guarantee. Audits should not re-flag flat-rate modeling while this section stands. Revisit trigger: the same as aggregation's — when reward computation is built, caps/tiers are modeled with it (schema change to `card_categories`, seed shape, and a rate display that qualifies itself near the cap).

## Data export deferred (confirmed 2026-09-07)

Successive flexibility audits flagged the absence of any CSV/JSON export or dump path as a replaceability/lock-in gap — manually categorized transaction history ([[categorization-is-a-historical-snapshot]]) exists nowhere else once in Postgres — and noted it wasn't recorded as a decision. It now is: the user chose to defer building an export path.

Rationale: at this stage the operator is the developer ([[operator-is-developer]]) with direct database access, so `pg_dump` (or ad-hoc SQL) is a real, complete extraction path — an export endpoint would duplicate it for no current user. The data at risk is also still shallow (days of transactions, one card).

Revisit trigger: accumulated categorization history the user would mind losing, a second (non-developer) user, or any migration away from this Postgres — any of those makes a first-class export (JSON dump of accounts, transactions, and category assignments) worth building.
