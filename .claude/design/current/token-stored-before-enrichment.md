---
name: token-stored-before-enrichment
description: linkItem persists the exchanged access token in a minimal item row before any further Plaid call, so a transient failure can never orphan a live Plaid Item
tags: [src/lib/link.ts, linkItem, storeItemShell, exchangePublicToken, items.access_token]
date: 2026-09-06
---

The moment `itemPublicTokenExchange` answers, the Item is live at Plaid. `linkItem` therefore upserts a minimal item row (item id + encrypted token) before calling `itemGet`/`accountsGet`: if any enrichment call then fails, the link request errors but the item is visible locally — it can be synced later or removed — instead of leaving a live Plaid Item behind a discarded token that `DELETE /api/items/[itemId]` can never reach. The full metadata upsert ([[relink-preserves-institution-metadata]]) follows on the happy path, re-writing the ciphertext the shell returned verbatim — the token is encrypted exactly once per link, so the two upserts cannot drift on that column (2026-09-06). The enrichment reads themselves (`itemGet`, `accountsGet`) run in parallel: independent, and the link request is the latency-sensitive one ([[inline-initial-sync]]). Confirmed 2026-09-06 after a quality audit flagged the orphaning gap.
