---
name: webhook-triggered-sync
description: POST /api/webhook was the automatic sync path; a verified TRANSACTIONS/SYNC_UPDATES_AVAILABLE webhook ran syncItem inline for the named item, and every other webhook was acknowledged with a 200
tags: [POST /api/webhook, src/app/api/webhook/route.ts, syncItem, SYNC_UPDATES_AVAILABLE]
date: 2026-09-04
---

Retired 2026-09-05. The webhook path required an internet-reachable route and therefore a tunnel, and the 2026-09-05 audit found the tunnel exposed `next dev`'s `/__nextjs_*` endpoints past every guard — the dev bundler serves them before route resolution, so `src/proxy.ts` structurally cannot intercept them. The whole internet-facing surface (route, verification, tunnel) was replaced by an in-process scheduler ([[scheduled-sync]]). If code answering Plaid webhooks reappears, flag it.
