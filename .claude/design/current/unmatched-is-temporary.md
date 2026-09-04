---
name: unmatched-is-temporary
description: An account's card is a fixed fact; a null card_id is only a temporary naming mismatch and never a reason to erase saved categories. Accounts do not move between cards.
tags: [upsertAccount, src/lib/accounts.ts, scripts/seed-cards.ts, syncItem carry, accounts.card_id, transactions.card_category_id]
date: 2026-09-04
---

A Plaid account rename can drop the match until the seed file lists the new name. During that window the account is unsupported ([[supported-account-rule]]) but nothing about it is wrong: no writer may clear or drop a saved category or rate because `card_id` is currently null, and everything reappears once the match comes back.

An account never legitimately starts matching a *different* card. The user would not move an Amex Blue account's history onto an Amex Gold. There is therefore no "card move" case to handle, and no writer clears card-category links on the strength of a card mismatch. Consistent with [[categorization-is-a-historical-snapshot]]: old transactions are never rewritten because the card side changed.

Resolved 2026-09-04: the card-move wipe is gone from `upsertAccount`, the seed reconcile and the pending-to-posted carry. `upsertAccount` now writes the accounts row and nothing else; the seed's per-account loop only re-matches; the carry consults neither the account's card nor the category's. See [[card-move-wipe]] in retired.
