---
characteristic: 'compatibility'
---

# Summary

All three auditors returned clean passes with zero findings. Earlier-era resolutions were re-verified intact: Node version contract enforcement (`.npmrc` `engine-strict=true` plus `assertSupportedNode()` in `src/lib/env.ts`, which now derives the checked major from `package.json` `engines.node` itself), `npm run start` port-conflict probing with an actionable `EADDRINUSE` fast-fail in `scripts/start.mjs`, the timezone-safe date type parser in `src/lib/pool-config.ts`, and the transaction-pooling-proxy detection (`assertSessionModeConnection()` in `src/lib/db.ts`).

Fresh sweeps covered co-existence (advisory-lock namespacing scoped by `LOCK_CLASS_ID`, pool sizing vs. sync concurrency, port handling, `globalThis` singleton namespacing, `.next` permission tightening confined to the app's own directory with a documented win32 skip) and interoperability (Plaid API version pinned via header, CSP allowance for `cdn.plaid.com`, the `Serialized<T>` client/server data-exchange contract, PG11-compatible migration DDL, `Intl.NumberFormat` currency fallback for non-ISO codes, consistent dependency versions with the axios override). Everything is deliberately guarded, consistent, or explicitly blessed by SNAPSHOT.md.

# Major Concerns

None.

# Moderate Concerns

None.

# Minor Concerns

None.
