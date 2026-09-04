---
name: webhook-registration
description: PLAID_WEBHOOK_URL (optional; validated as an http(s) URL when set) reaches new items via the link token and existing items via the one-off npm run webhooks:update script
tags: [getWebhookUrl, PLAID_WEBHOOK_URL, createLinkToken, updateItemWebhook, scripts/update-webhooks.ts, npm run webhooks:update]
date: 2026-09-04
---

Webhooks are opt-in by config: an unset `PLAID_WEBHOOK_URL` disables them (the link token simply omits the field); set, it must be an http(s) URL, because Plaid accepts a garbage string and then delivers nothing ([[config-validated-not-assumed]]). `createLinkToken` passes it so newly linked items report automatically. Items linked before it was set (or after it changed) are covered by `npm run webhooks:update`, which calls itemWebhookUpdate per stored item, logs and skips per-item failures so one revoked token doesn't stop the rest, and exits non-zero if any failed. Chosen over pushing the URL on every Sync all (an extra Plaid call per item per sync) and over relinking (manual work per institution).
