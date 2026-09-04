---
name: inline-initial-sync
description: The first sync of a newly linked item runs inside the link request, not as a background job
tags: [src/app/api/exchange/route.ts, syncItem, notReadyRetries]
date: 2026-09-04
---

Initial sync pulls a few days of history at most, so it runs inline in `POST /api/exchange` with a capped not-ready poll (3 retries, about 6s). A background job the client polls is the eventual fix for hosts with request timeouts, and is deliberately not built while the app runs on one machine. See [[single-user-localhost-no-auth]].
