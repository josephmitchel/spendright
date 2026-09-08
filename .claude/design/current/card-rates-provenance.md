---
name: card-rates-provenance
description: Every card seed must carry ratesVerified (date + source) attesting when its reward rates were checked against issuer terms — the seed script rejects a blank source, a malformed or future date; the plausibility bound alone can't catch in-range typos
tags: [ratesVerified, src/db/cards.seed.ts, scripts/seed-cards.ts, assertSeedIsValid, MAX_PLAUSIBLE_RATE]
date: 2026-09-07
---

Confirmed 2026-09-07: successive safety audits flagged that `MAX_PLAUSIBLE_RATE` ([[seed-validation]]) only rejects order-of-magnitude typos — an in-range error (5 typed for an actual 6) ships to the UI as authoritative spending guidance and, per [[categorization-is-a-historical-snapshot]], gets permanently baked into `transactions.reward_rate`. The user chose a seed-file provenance marker over a schema change.

`CardSeed.ratesVerified` (`{ on, source }`) is required per card; `assertSeedIsValid` rejects a blank source, a non-`YYYY-MM-DD` date, or a future date. The marker lives only in `cards.seed.ts` — it is an editorial attestation forcing a human to re-check issuer terms whenever rates are added or changed, not persisted data ([[card-catalog-in-code]] keeps the seed file the editorial authority). Persisting it to the cards table (to surface "rates verified as of…" in the UI) was considered and deferred until the catalog grows.
