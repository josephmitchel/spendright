---
characteristic: 'compatibility'
---

# Summary

All three auditors returned clean passes, and both prior Minor concerns are verified resolved with concrete enforcement: the Node version contract is now enforced both at install time (`.npmrc` `engine-strict=true`) and at startup (`assertSupportedNode()` in `src/lib/env.ts:6-14`, wired via `src/instrumentation.ts`), and `npm run start` now probes the target port and fails fast with a clear `EADDRINUSE` message (`scripts/start.mjs`) instead of falling into the generic crash-loop guard. The earlier era's Major (timezone-dependent date parsing) and Moderate (undetected transaction-pooling proxy) fixes remain intact — `types.setTypeParser(1082, ...)` in `pool-config.ts` is still the sole pool construction path, and `assertSessionModeConnection()` still fails startup loudly. Fresh sweeps across Plaid API version pinning, the `Serialized<T>` client/server contract, migration PG11-compatibility, peer-dependency consistency, and cross-platform script behavior found nothing new.

# Major Concerns

None.

# Moderate Concerns

None.

# Minor Concerns

None.

# Resolved since prior audit

- `[prior → resolved]` Node version contract declared but not enforced — `.npmrc:1` `engine-strict=true` plus runtime `assertSupportedNode()` (`src/lib/env.ts:6-14`, `src/instrumentation.ts:10-11`).
- `[prior → resolved]` `npm run start` had no port-conflict fallback — `scripts/start.mjs` now probes the port before spawning and exits immediately with an actionable message on `EADDRINUSE`.
