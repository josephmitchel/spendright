---
name: webhook-jwt-verification
description: /api/webhook verifies Plaid's ES256 JWT (pinned alg, signature, body hash, five-minute freshness) before reading the body, answering a uniform 401 with the specific reason logged server-side only
tags: [verifyPlaidWebhook, src/lib/webhook.ts, getWebhookVerificationKey, Plaid-Verification, UNVERIFIED, keyCache]
date: 2026-09-04
---

The webhook route is the one route that must be internet-reachable (through a tunnel), so unlike the rest of the app ([[single-user-localhost-no-auth]]) it cannot rely on localhost being the only caller. The `Plaid-Verification` JWT is verified with Node's crypto, no new dependency: alg pinned to ES256 (never read from the header), the key fetched from Plaid by kid and cached per process, keys Plaid marks expired refused, the signature checked (ieee-p1363), `iat` within five minutes, and `request_body_sha256` compared timing-safe against the hash of the raw body bytes. A bogus kid is a 401, not a 502. Every failure logs its specific reason server-side and answers the same generic 401 `UNVERIFIED`.
