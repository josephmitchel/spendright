---
characteristic: "security"
---
# Summary

All three auditors independently described the security posture as unusually mature for the project's stage. The prior audit trail recorded in `.claude/design/current/` (loopback-only binding, `src/proxy.ts` Host/Origin/X-Forwarded guards, CSRF checks, clickjacking headers, AES-256-GCM token encryption, allow-listed error messages, Axios log redaction, tightened `.next` permissions) was verified as still in place and effective. `npm audit` is clean. No auditor found a major issue, and none re-litigated the documented single-user/localhost/no-auth posture, which the design record itself already tracks as a blocker before real deployment. Verified-solid items: parameterized SQL everywhere (no string-built SQL), no XSS sinks, no secrets in git or history, raw Plaid payloads and tokens excluded from served responses via column allow-lists.

# Major Concerns

None found by any auditor.

# Moderate Concerns

- **No CSP beyond `frame-ancestors`** (1 auditor) — `next.config.ts` sets only `Content-Security-Policy: frame-ancestors 'none'`; there is no `script-src`/`default-src` restriction, so no defense-in-depth layer if an XSS vector is ever introduced. Low urgency (plain React, no `dangerouslySetInnerHTML`/`eval` anywhere), but worth adding before the app grows.
- **No TLS enforcement on the Postgres connection** (2 auditors, ranked moderate/minor) — `src/lib/db.ts` builds the `pg.Pool` from `DATABASE_URL` alone; `requireDatabaseUrl()` in `src/lib/env.ts` checks only the URL scheme, not `sslmode`. Harmless under the local-Postgres model, but if `DATABASE_URL` is ever pointed at a remote instance, financial data would traverse the network in cleartext unless the operator remembers `sslmode=require`. Consider enforcing/validating `sslmode` when the host isn't loopback.

# Minor Concerns

- **Unbounded pagination `offset` as a resource-exhaustion lever** (1 auditor) — `src/app/api/transactions/route.ts` clamps `limit` to 1000 but `offset` only to `Number.MAX_SAFE_INTEGER`; a large offset forces Postgres to scan and discard rows (Resistance subcharacteristic). Limited today by the loopback boundary.
- **No rate limiting on Plaid-facing routes** (1 auditor) — `/api/link-token` and `/api/exchange` have no throttling; irrelevant while loopback-only, but they could exhaust Plaid quota if the network boundary is ever relaxed.
- **No automated dependency/vulnerability scanning gate** (1 auditor) — `npm run lint` doesn't include `npm audit` (or SCA/SAST), and there is no CI workflow, so a new advisory landing in a dependency bump has no automatic signal. Process gap, not a code vulnerability.
- **Fixed `client_user_id` in Plaid link tokens** (1 auditor) — `src/lib/plaid.ts:111` hardcodes `'spendright-user'`; consistent with single-user design, revisit only if multiple Plaid end-user identities ever exist.
- **`next dev` internal debug endpoints remain a documented residual gap** (1 auditor) — `/__nextjs_*` bypasses `src/proxy.ts` under DNS rebinding in dev mode; the recorded mitigation ("use `next start` as the everyday mode", `non-local-request-guard.md`) is a process control dependent on operator discipline, not a code control.
