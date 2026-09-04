---
name: automatic-sync
description: Transaction sync runs automatically from a scheduler or a Plaid webhook; the manual Sync all button is interim
tags: [POST /api/sync, syncItem, HomeClient syncAll, webhook, scheduler]
date: 2026-09-04
---

Syncing should not depend on the user pressing a button. The intended design is that syncs are triggered automatically, by a scheduled job, a Plaid transactions webhook, or both. The "Sync all" button and the inline sync at link time ([[inline-initial-sync]]) are acceptable as interim mechanisms and may remain alongside the automatic path.

Built 2026-09-04: `POST /api/webhook` is the automatic path ([[webhook-triggered-sync]], [[webhook-jwt-verification]], [[webhook-registration]]). A scheduler remains unbuilt and optional — not an audit finding while the webhook path exists.
