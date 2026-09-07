---
name: link-notice-expires-on-clean-sync
description: The "Connected, but…" link notice expires once a later "Sync all" comes back fully clean
tags: [syncSucceededAt, noticeIsCurrent, PlaidLinkButton, home page syncAll]
date: 2026-09-04
---

The connect-time notice from [[initial-sync-reported-not-thrown]] is timestamped. The home page (`src/app/page.tsx`) records `syncSucceededAt` when a "Sync all" finishes with every item error-free and nothing skipped or dropped, and `PlaidLinkButton` treats any notice raised before that time as stale and hides it. A partial or failed sync never expires the notice.
