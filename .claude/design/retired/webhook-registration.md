---
name: webhook-registration
description: PLAID_WEBHOOK_URL reached new items via the link token and existing items via the one-off npm run webhooks:update script
tags: [getWebhookUrl, PLAID_WEBHOOK_URL, createLinkToken, updateItemWebhook, scripts/update-webhooks.ts]
date: 2026-09-04
---

Retired 2026-09-05 with the webhook path ([[scheduled-sync]]). `PLAID_WEBHOOK_URL`, the link-token webhook field, `updateItemWebhook`, and `npm run webhooks:update` were all removed; no Plaid item should have a webhook URL registered. If webhook registration code reappears, flag it.

End-state reached 2026-09-05: items linked before the retirement still had the old tunnel URL registered at Plaid, so a one-off script (written, run, and deleted the same day) called `itemWebhookUpdate({ webhook: '' })` for every stored item — Plaid confirmed `webhook: ""` on each. The stale `PLAID_WEBHOOK_URL` line was also removed from `.env.local`. Nothing remains to clear; do not re-raise.
