---
name: config-validated-not-assumed
description: Environment configuration is validated with messages that name the variable and its required shape, never the value; misconfiguration must never fail open
tags: [getBasePath, getKey, decrypt, splitEnvList, src/lib/plaid.ts, src/lib/crypto.ts, scripts/load-env.ts, BAD_CONFIG]
date: 2026-09-04
---

`PLAID_ENV` is checked against the SDK's known environments because an unknown value would silently send calls to production. `ENCRYPTION_KEY` is checked for 64 hex chars; stored ciphertext is checked for shape and a rotated key is reported by name. `PLAID_PRODUCTS` and `PLAID_COUNTRY_CODES` are trimmed and blank-filtered. `.env.local` wins over `.env` everywhere (Next, drizzle config, scripts). Config failures throw `PublicError` with code `BAD_CONFIG` so they reach the user.
