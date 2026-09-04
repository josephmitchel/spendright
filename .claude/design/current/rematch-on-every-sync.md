---
name: rematch-on-every-sync
description: The account-to-card match is recomputed on every sync and every seed run and always overwrites the stored card_id
tags: [upsertAccount, src/lib/accounts.ts, scripts/seed-cards.ts, accounts.card_id]
date: 2026-09-04
---

`upsertAccount` re-runs `matchCard` and writes the result over `accounts.card_id` unconditionally. A Plaid rename that no longer matches drops the account to unsupported on the next sync, not only on re-link. There is deliberately no "keep the existing card_id" branch; do not add one. Nothing is destroyed by the demotion (see [[unmatched-is-temporary]]).
