---
name: automatic-sync
description: Transaction sync runs automatically from a scheduler or a Plaid webhook; the manual Sync all button is interim
tags: [POST /api/sync, syncItem, HomeClient syncAll, webhook, scheduler]
date: 2026-09-04
---

Syncing should not depend on the user pressing a button. The intended design is that syncs are triggered automatically, by a scheduled job, a Plaid transactions webhook, or both. The "Sync all" button and the inline sync at link time ([[inline-initial-sync]]) are acceptable as interim mechanisms and may remain alongside the automatic path.

Known gap (2026-09-04): no scheduler and no webhook route exist; sync runs only from the button and at link time. Flag on every audit until built.
