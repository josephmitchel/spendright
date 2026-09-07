---
name: automatic-sync
description: Transaction sync runs automatically from an in-process hourly scheduler; the manual Sync all button remains alongside it
tags: [POST /api/sync, syncItem, syncAllItems, home page syncAll, scheduler, startSyncScheduler]
date: 2026-09-04
---

Syncing should not depend on the user pressing a button. The intended design is that syncs are triggered automatically. The "Sync all" button and the inline sync at link time ([[inline-initial-sync]]) are acceptable alongside the automatic path.

Built 2026-09-04 as a Plaid webhook path; replaced 2026-09-05 by the in-process scheduler ([[scheduled-sync]]) when the webhook's tunnel proved to be an exposure itself (retired [[webhook-triggered-sync]]).
