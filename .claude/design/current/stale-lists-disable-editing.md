---
name: stale-lists-disable-editing
description: Category pickers are disabled, not hidden, whenever the category lists may be stale
tags: [categoriesMayBeStale, CategorySelect, src/app/accounts/[accountId]/page.tsx]
date: 2026-09-04
---

If either the account read or the cards read failed, both pickers are disabled with a notice, and the rows, balances and saved assignments stay on screen. One rule for both kinds rather than one per kind. The server remains the real guard; disabling only stops offering a choice the page cannot stand behind.
