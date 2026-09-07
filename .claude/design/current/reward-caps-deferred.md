---
name: reward-caps-deferred
description: Reward rates are modeled as a single flat number per card category — real-world caps and tiers (e.g. an elevated rate up to an annual spend threshold, then a lower one) are a known, accepted inaccuracy until reward aggregation exists to compute cumulative spend against a cap
tags: [card_categories.rate, cards.seed.ts, rateCellText, TransactionTable.tsx]
date: 2026-09-07
---

Confirmed 2026-09-07: the 2026-09-07 audit (functional suitability and safety both) flagged that `card_categories.rate` is a flat `numeric` with no cap/threshold concept, while the one seeded card's elevated categories really cap at an annual spend amount and then drop — so past the cap the displayed rate is wrong, in the exact figure the app's purpose rests on. The user confirmed deferring cap/tier modeling rather than building it now: a cap is only enforceable against _cumulative_ spend, which requires the aggregation machinery that is itself deferred ([[reward-aggregation-deferred]]) — a cap field without it would be stored but uncheckable, false precision rather than accuracy. The flat rate is understood as "the headline rate", not a guarantee. Audits should not re-flag flat-rate modeling while this record stands. Revisit trigger: the same as aggregation's — when reward computation is built, caps/tiers are modeled with it (schema change to `card_categories`, seed shape, and a rate display that qualifies itself near the cap).
