---
name: single-user-localhost-no-auth
description: SpendRight is a single-user tool run on localhost; no route is authenticated and the long-running link route is accepted
tags: [src/app/api/exchange/route.ts, src/app/api/items/[itemId]/route.ts, POST /api/exchange, DELETE /api/items/[itemId]]
date: 2026-09-04
---

Every route under `/api` is open, including the ones that mint Plaid access tokens, delete an institution, and return full transaction history. `POST /api/exchange` makes several Plaid calls and runs the first sync inline. Both are deliberate for a tool that only the local browser can reach, and both are blockers before it is reachable from anywhere else. Do not flag them as bugs; flag them if the app is being deployed.

The 2026-09-04 security audit found the "only the local browser can reach it" premise broken two ways: `next dev` bound `0.0.0.0` (LAN-reachable) and the webhook tunnel forwarded every route to the internet. Confirmed fix: non-local requests are now refused outright ([[non-local-request-guard]]). The no-auth posture itself is unchanged and still a blocker before real deployment.
