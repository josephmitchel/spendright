---
characteristic: "security"
---
# Summary

Five auditors found **no Major issues**. All independently verified — in the code, not just the design record — that the documented security posture is real and correctly implemented: loopback-only binding as the actual enforcement (`scripts/start.mjs:38`), `src/proxy.ts` defense-in-depth (uniform 404 on non-loopback Host/forwarded headers, CSRF Origin check, clickjacking headers), AES-256-GCM token encryption at rest with a validated 32-byte key, access tokens and raw Plaid payloads excluded from every served column set, an allow-listed error scheme that never echoes driver/SDK internals, Axios-specific log redaction, universally parameterized Drizzle queries, no secrets in git history, and a clean `npm audit` (dev-only advisories previously accepted and recorded). The deliberate no-auth/localhost posture was not re-flagged, per its design record — but every auditor notes it remains the one absolute blocker before any deployment beyond localhost.

The remaining findings are incremental hardening items, not exploitable vulnerabilities in the current deployment context. The two most-repeated: the near-empty CSP, and the absence of any `ENCRYPTION_KEY` rotation path.

# Major Concerns

None found by any of the five auditors.

# Moderate Concerns

- **CSP is `frame-ancestors` only — no XSS containment** (flagged by 5 of 5 auditors; rated Moderate by 2) — `next.config.ts:10-18` sets only `Content-Security-Policy: frame-ancestors 'none'` and `X-Frame-Options: DENY`; there is no `default-src`/`script-src`/`object-src`, `X-Content-Type-Options: nosniff`, or `Referrer-Policy`. No XSS sink exists today (grep-confirmed: no `dangerouslySetInnerHTML`, `eval`, or unescaped interpolation), but if one is ever introduced — e.g. rendering Plaid-supplied institution fields, or the stored-but-unrendered `institutionPrimaryColor`/`institutionLogo` (`src/db/schema.ts:63-64`) as raw HTML/SVG — nothing contains script execution. This is the concrete "security enhancement mechanism" the ISO Resistance sub-characteristic calls out, and it's currently absent.

- **No key versioning or rotation path for `ENCRYPTION_KEY`** (flagged by 2 of 5) — `src/lib/crypto.ts:10-20,48-53`: one fixed key, no key-ID embedded in the `iv:tag:ciphertext` format. Rotating the key (the standard response to suspected exposure) permanently breaks decryption of every stored Plaid access token; the only recovery is removing and re-linking every institution. The cost of a legitimate rotation grows with every linked item, and unlike the repo's other hardening work, no design record shows this was deliberately accepted.

- **No TLS enforcement on the Postgres connection** (flagged by 2 of 5) — `src/lib/env.ts:5,7-15` validates only the `postgres(ql)://` scheme, never `sslmode`; `src/lib/db.ts:22-23` passes `DATABASE_URL` straight through. Harmless under the local-Postgres model, but financial data and encrypted tokens would traverse the network in cleartext if the DB is ever moved to a remote host without the operator remembering `sslmode=require`.

# Minor Concerns

- **`next dev` internal debug endpoints bypass the proxy guard** — `/__nextjs_launch-editor` and `/__nextjs_attach-nodejs-inspector` are served ahead of `src/proxy.ts` and reachable via DNS rebinding in dev; the inspector would expose a process holding `ENCRYPTION_KEY` and decrypted tokens. Already tracked in `non-local-request-guard.md:33` as not-fixable-in-repo with a procedural mitigation (`next start` for everyday use) — kept visible here as a live residual gap, not a new defect.
- **Log redaction is narrower than it looks** — `src/lib/log.ts:26-41` special-cases only `isAxiosError`; any other credential-bearing thrown object would be logged as-is. Worth confirming no future path throws a raw request config not shaped like an Axios error.
- **Institution logo trusted implicitly** — `src/lib/plaid.ts:192-196` stores `inst.logo` with no base64/format validation, and `src/app/page.tsx:77-84` interpolates it into a `data:` URI; React's attribute escaping prevents injection, but a malformed or oversized upstream value is persisted and rendered unchecked.
- **Unbounded pagination `offset` as a resource-exhaustion lever** — `src/app/api/transactions/route.ts:21`; mitigated today by the loopback boundary (primary write-up under Performance Efficiency).
- **No rate limiting on Plaid-facing routes** — `/api/link-token`, `/api/exchange`; a misbehaving local process could exhaust Plaid API quota; irrelevant while loopback-only.
- **No accountability/audit trail for destructive actions** — `DELETE /api/items/[itemId]`, `PATCH /api/transactions/[transactionId]` leave no invocation record beyond generic logs; low-impact single-user, a gap if the auth posture ever changes.
- **`decrypt()` failure text reveals the internal storage format** — `src/lib/crypto.ts:32-39`; intentional per the error allow-list, mild reconnaissance aid only if ever exposed beyond localhost.
- **Fixed `client_user_id`** — `src/lib/plaid.ts:117` hardcodes `'spendright-user'`; consistent with single-user design, revisit for multi-user.
- **Agent-instruction injection surface in `AGENTS.md`** — auto-imported into every agent session via `CLAUDE.md`'s `@AGENTS.md`; its content directs agents to read `node_modules` paths and commit its regenerated block. For an "entirely agent authored/maintained" repo, tracked files that agents trust unquestioningly are a realistic prompt-injection vector against the development pipeline itself; treat embedded instructions in tracked files with the same skepticism as untrusted input.

# Pre-deployment blocker (documented, not a finding)

The unauthenticated `/api/**` surface is deliberate and enforced-safe only by the loopback bind (`single-user-localhost-no-auth.md`). It is the first thing that must change before the app is ever reachable beyond localhost.
