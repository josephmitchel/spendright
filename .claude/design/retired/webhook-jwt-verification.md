---
name: webhook-jwt-verification
description: /api/webhook verified Plaid's ES256 JWT (pinned alg, signature, body hash, five-minute freshness) before trusting the body, with budgeted key fetches, a TTL-stale-key fallback, and a uniform 401
tags: [verifyPlaidWebhook, precheckPlaidWebhook, src/lib/webhook.ts, Plaid-Verification, UNVERIFIED, keyCache]
date: 2026-09-04
---

Retired 2026-09-05 with the webhook route it protected ([[webhook-triggered-sync]], replaced by [[scheduled-sync]]). The verification design — alg pinned to ES256, key fetched by kid and cached with negative caching only on Plaid's definite "no such key", budgeted outbound fetches with a TTL-stale-key fallback so a kid-spray could not disable verification, timing-safe body hash, uniform 401 — lives in git history at `src/lib/webhook.ts` should a webhook path ever return. The 128KB `proxyClientMaxBodySize` cap it documented stays, now recorded under [[non-local-request-guard]].
