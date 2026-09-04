---
name: access-tokens-encrypted
description: Plaid access tokens are stored AES-256-GCM encrypted under ENCRYPTION_KEY and never returned by any route
tags: [src/lib/crypto.ts, encrypt, decrypt, items.access_token, GET /api/items]
date: 2026-09-04
---

Tokens are stored as `iv:tag:ciphertext` hex. `GET /api/items` strips the column. Rotating the key invalidates every stored token; the decrypt path names that condition explicitly (see [[config-validated-not-assumed]]).
