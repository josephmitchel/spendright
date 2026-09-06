---
name: inline-initial-sync
description: The first sync of a newly linked item runs inside the link request, not as a background job
tags: [linkItem, src/lib/link.ts, src/app/api/exchange/route.ts, syncItem, notReadyRetries]
date: 2026-09-04
---

Initial sync pulls a few days of history at most, so it runs inline in `POST /api/exchange` (the flow itself lives in `src/lib/link.ts` `linkItem` since 2026-09-06 — [[thin-routes-domain-in-lib]]) with a capped not-ready poll (3 retries, about 6s). A background job the client polls is the eventual fix for hosts with request timeouts, and is deliberately not built while the app runs on one machine. See [[single-user-localhost-no-auth]]. The inline sync is serialized against any concurrent scheduled or manual sync of the same item by `syncItem`'s per-item lock ([[scheduled-sync]], 2026-09-06) — it takes no part in the sync-all single-flight guard and does not need to.
