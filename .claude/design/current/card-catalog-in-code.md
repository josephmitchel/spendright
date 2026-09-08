---
name: card-catalog-in-code
description: Cards and categories are defined in a seed file and reconciled into Postgres by a script (no UI) — the reconcile retires what left the file, the seed is validated (uniqueness, plausible rates, rate provenance) before touching the database, and loadCardCatalog is the one loader of matchCard's input
tags:
  [
    src/db/cards.seed.ts,
    scripts/seed-cards.ts,
    npm run seed:cards,
    cards,
    card_categories,
    credit_categories,
    retired_at,
    assertUniqueKeys,
    assertSeedIsValid,
    MAX_PLAUSIBLE_RATE,
    ratesVerified,
    src/lib/card-catalog.ts,
    loadCardCatalog,
    listOfferedCards,
    matchCard,
    storeAccounts,
  ]
date: 2026-09-04
---

The card catalog is `src/db/cards.seed.ts`, applied with `npm run seed:cards`. `slug` is a card's stable identity: changing anything else updates the card, changing the slug creates a new one. Removing a slug or a category name retires the row rather than deleting it, and adding it back revives the same row ([[categories-retired-not-deleted]]). Credit (inflow) categories are a global list in the same file. No UI or API writes cards or categories.

## Seed reconcile is destructive (decided 2026-09-04)

The seed reconciles rather than appends: cards, card categories and credit categories absent from the seed file are removed from what can be picked. "Removed" means retired, not deleted ([[categories-retired-not-deleted]]). The reconcile transaction writes only the catalog tables and the accounts re-match — no statement in it touches `transactions`. The one statement in the script that does touch `transactions` sits outside that transaction: a backfill that fills only null `reward_rate`s and never overwrites one ([[categorization-is-a-historical-snapshot]]). Existing transactions keep the category and rate they were categorized with.

The retire pass is one implementation, `retireMissing` in scripts/seed-cards.ts (2026-09-06), shared by card categories, credit categories and cards — so the keep-the-original-stamp condition (`retired_at is null`) and the empty-kept-list rule (an empty seed list retires everything in scope, because drizzle can't render `notInArray([])`) live in one place instead of three drift-prone copies.

Resolved 2026-09-04: the hard-delete reconcile, whose FK cascades stripped categories from old transactions, is gone.

## Seed validation (decided 2026-09-04)

Before touching the database the seed fails loudly if a card slug is blank or used twice (case-insensitive — two seeds sharing a slug would otherwise silently merge, the second upsert winning), if a Plaid account name is claimed by two cards or is blank, if a card lists a category name twice (case-insensitive), or if a credit category name repeats. Bad seed data is rejected at the source rather than defended against downstream. The four original per-check asserts were consolidated into one `assertUniqueKeys` helper called from `assertSeedIsValid` (2026-09-06); the checks themselves are unchanged.

Added 2026-09-07 (confirmed by the user after the 2026-09-07 audit — all four safety auditors and three functional-suitability auditors flagged it): every category `rate` must be finite, greater than 0, and at most `MAX_PLAUSIBLE_RATE` (20). The seed file is the sole editorial authority on rates with no downstream guard, so a transposition typo (`60` for `6`) previously shipped straight to the UI and into per-transaction `reward_rate` snapshots as authoritative guidance. No real card pays more than ~10% cashback or ~10x points; 20 leaves promo headroom while catching order-of-magnitude typos. Distinct from the caps deferral ([[deferred-features]]), which defers cap/tier *modeling* — this checks the plausibility of the flat number itself.

## Card rates provenance (confirmed 2026-09-07)

Successive safety audits flagged that `MAX_PLAUSIBLE_RATE` (above) only rejects order-of-magnitude typos — an in-range error (5 typed for an actual 6) ships to the UI as authoritative spending guidance and, per [[categorization-is-a-historical-snapshot]], gets permanently baked into `transactions.reward_rate`. The user chose a seed-file provenance marker over a schema change.

`CardSeed.ratesVerified` (`{ on, source }`) is required per card; `assertSeedIsValid` rejects a blank source, a non-`YYYY-MM-DD` date, or a future date. The marker lives only in `cards.seed.ts` — it is an editorial attestation forcing a human to re-check issuer terms whenever rates are added or changed, not persisted data (this record keeps the seed file the editorial authority). Persisting it to the cards table (to surface "rates verified as of…" in the UI) was considered and deferred until the catalog grows.

## Single card-catalog loader (confirmed 2026-09-06)

The ordered card read (`order by id`, so matching never depends on physical row order — [[account-card-matching-by-name]]) was copied in three places with three failure policies; it now lives once in `src/lib/card-catalog.ts`, which takes the drizzle executor as a parameter (like `matchCard`, no db import) so the seed script can use it without opening a second pool. The unified failure policy is to propagate: because `card_id` is re-matched on every account write ([[account-card-matching-by-name]]), storing accounts against an empty catalog would overwrite their matches with null, so no caller stores accounts on a failed catalog read — the link request or sync fails instead. `listOfferedCards` (the pickers' retired-filtered view, [[list-endpoints-ordered]]) lives alongside it.
