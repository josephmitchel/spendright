---
name: config-validated-not-assumed
description: Environment configuration is validated with messages that name the variable and its required shape, never the value; misconfiguration must never fail open
tags: [getBasePath, getKey, decrypt, splitEnvList, getConnectionString, src/lib/plaid.ts, src/lib/crypto.ts, src/lib/db.ts, scripts/load-env.ts, BAD_CONFIG]
date: 2026-09-04
---

`PLAID_ENV` is checked against the SDK's known environments because an unknown value would silently send calls to production. `ENCRYPTION_KEY` is checked for 64 hex chars; stored ciphertext is checked for shape and a rotated key is reported by name. `DATABASE_URL` is checked for a `postgresql://` scheme in `src/lib/db.ts` (added 2026-09-04) because `pg` reads an unset value as "use libpq defaults" and would quietly query whatever database is listening on localhost; the seed script has the same guard. `PLAID_PRODUCTS` and `PLAID_COUNTRY_CODES` are trimmed and blank-filtered. `.env.local` wins over `.env` everywhere (Next, drizzle config, scripts). Config failures throw `PublicError` with code `BAD_CONFIG` so they reach the user; the `DATABASE_URL` check runs at module load, so it surfaces in the dev server log and overlay rather than through `errorResponse`.
