---
characteristic: "security"
---
# Summary

Four auditors assessed security (ISO/IEC 25010:2023 §3.6). All four independently verified the existing security design records against the implementation and found them accurate: AES-256-GCM token encryption with a working rotation path, the loopback bind plus `src/proxy.ts` Host/forwarded-header/Origin/CSRF/DNS-rebinding guards, error-message and log-redaction allow-lists, PII excluded from every served projection, fully parameterized DB access (including the advisory-lock key), `.env.local` at 0600, tightened `.next` cache permissions, magic-byte logo sniffing that correctly excludes SVG, and a clean `npm audit --omit=dev`. The deliberate no-auth/localhost threat model (`single-user-localhost-no-auth.md`) and the accepted dev-dependency advisory were honored and not re-litigated.

The one finding with unanimous cross-agent consensus (3/4 auditors independently, each rating it moderate) is `'unsafe-inline'` in the CSP's `script-src`.

# Major Concerns

None. The unauthenticated `/api/**` surface remains major in the abstract but is a documented, user-confirmed decision scoped to loopback-only operation, with its enforcement (`-H 127.0.0.1` bind + proxy guards) verified present and correct.

# Moderate Concerns

- **CSP `script-src` includes `'unsafe-inline'`, undermining its stated XSS-containment purpose** (3/4 auditors, all moderate) — `next.config.ts` (~lines 22-24). The comment above the policy claims the CSP "contains any script that ever slips in," but `'unsafe-inline'` defeats containment for the most common XSS vector. No inline script sink exists in `src/` today (no `dangerouslySetInnerHTML`/`eval`, grep-confirmed), so this is defense-in-depth rather than an active exploit. Next.js supports a nonce-based CSP via per-request middleware (`src/proxy.ts` already runs per-request; Next auto-attaches the nonce to its own bootstrap scripts), though nonces force dynamic rendering for affected pages — a real trade-off. No design record shows this trade-off was evaluated (unlike the commented, dev-scoped `unsafe-eval`), so it currently reads as a default rather than a decision. Either adopt nonces or record the acceptance.

# Minor Concerns

- **`dev` script's loopback bind is overridable, unlike `start`'s** (1 auditor) — `package.json` (`"dev": "next dev -H 127.0.0.1"`) vs `scripts/start.mjs`'s deliberate append-after-user-args ordering. `npm run dev -- -H 0.0.0.0` appends after the script's flag and wins under Next's last-wins CLI semantics, binding every interface — and dev mode is exactly where `/__nextjs_*` endpoints bypass the proxy. An asymmetry `non-local-request-guard.md`'s own reasoning doesn't cover.

- **Encryption-key validation checks shape only, not entropy** (2 auditors) — `src/lib/crypto.ts:7`: `^[0-9a-fA-F]{64}$` accepts 64 zeros or any degenerate value. Low risk given the documented `openssl rand -hex 32` path, but a weak-but-valid copy-paste key would encrypt every token with no warning.

- **Log redaction is keyed on Axios shape, not default-deny** (2 auditors) — `src/lib/log.ts:26-41`: only `isAxiosError` objects are redacted; a future non-Axios error carrying credentials would log verbatim. The invariant holds today by convention, not structurally, though `plaid-error-log-redaction.md` frames itself as covering every caught-error log site.

- **`decrypt()` failure messages reveal the storage/rotation scheme** (2 auditors) — `src/lib/crypto.ts:45-51, 69-74`: `PublicError`s naming `ENCRYPTION_KEY`/`ENCRYPTION_KEY_PREVIOUS` and the `iv:tag:ciphertext` format reach the client via the allow-list. Minor reconnaissance value only if ever exposed past localhost.

- **`style-src 'unsafe-inline'`** (1 auditor) — far smaller blast radius than the script-src issue (CSS injection cannot reach script execution) and commonly required by Next's style injection; noted only so it isn't conflated with the moderate finding above.

- **`institutionLogo` blob is size-unbounded** (1 auditor) — `src/db/schema.ts` / `src/lib/image-mime.ts` sniff MIME but never bound payload size; low risk while Plaid is a trusted upstream.

- **Multi-user blockers, noted for completeness only** (1 auditor) — fixed `client_user_id: 'spendright-user'` (`src/lib/plaid.ts:140`) and the absence of any audit trail on destructive/mutating routes are consistent with the accepted single-user model but become hard blockers before any authenticated or multi-user posture.
