---
characteristic: "security"
---
# Summary

No Major concerns, and no new findings from any of the four independent passes (API routes, SQL construction, proxy/CSP/CSRF layer, crypto, secrets handling, git history, dependency posture were all swept fresh). One Moderate and eight Minor concerns carry forward unaddressed. The esbuild/`drizzle-kit` dev-dependency advisory — raised as a Moderate in the prior audit — is no longer counted: `.claude/design/current/dev-dependency-advisories-accepted.md` (2026-09-05) formally accepts it and instructs audits not to re-raise it while its facts hold; two auditors verified the facts still hold (`npm audit --omit=dev` remains clean). The overall posture remains unusually mature for the stage: parameterized queries throughout, loopback bind + proxy + nonce CSP defense-in-depth, encrypted access tokens with a working rotation path, allow-listed error messages, 0600 `.env.local`, and clean git history.

# Major Concerns

None.

# Moderate Concerns

- `[prior]` **Financial data stored in plaintext at rest, with no recorded decision.** `src/db/schema.ts` stores balances, transaction amounts, merchant names, and the full raw Plaid payload (`transactions.plaidTransaction` jsonb) in cleartext; only `items.accessToken` is encrypted. Unlike the other current-stage trade-offs consolidated in `deployment-boundaries.md`, no design record scopes this as accepted — a DB file/backup compromise exposes full transaction history without the encryption key. (Flagged by all 4 auditors.)

# Minor Concerns

- `[prior]` **`npm run dev`'s loopback bind is overridable.** `package.json`'s `"dev": "next dev -H 127.0.0.1"` places the flag before user args, so `npm run dev -- -H 0.0.0.0` wins under last-wins CLI semantics; `scripts/start.mjs` closes exactly this hole for `start` but the fix was never applied to `dev`.
- `[prior]` **CSRF/Origin check passes silently when `Origin` is absent.** `src/proxy.ts:79` enforces same-origin only `if (origin && ...)`, so any local process reaching `127.0.0.1:3000` can drive state-changing endpoints. Recorded as intentional (curl support) in `non-local-request-guard.md`; carried as residual attack surface.
- `[prior]` **Encryption-key validation checks shape only, not entropy.** `ENCRYPTION_KEY_PATTERN` (`src/lib/crypto.ts`) accepts any 64-hex string, including all-zeros, with no weak-key warning.
- `[prior]` **Log redaction is allow-list-shaped, not default-deny.** `loggableError` (`src/lib/log.ts:26-41`) only redacts objects with `isAxiosError === true`; other error shapes carrying sensitive fields would log verbatim.
- `[prior]` **`decrypt()` failure messages leak scheme details.** `src/lib/crypto.ts:45-51, 69-74` throws `PublicError`s naming `ENCRYPTION_KEY`/`ENCRYPTION_KEY_PREVIOUS` and the `iv:tag:ciphertext` format, which pass the allow-list to the client. Reconnaissance value only.
- `[prior]` **`institutionLogo` blob is size-unbounded and structure-unvalidated.** No length constraint in `src/db/schema.ts`; `src/lib/image-mime.ts` sniffs only the base64 text prefix with no decoded-byte validation or size cap. Mitigated by `nosniff` and CSP `object-src 'none'`.
- `[prior]` **CSP `connect-src` uses a broad Plaid wildcard.** `buildCsp` (`src/proxy.ts`) allows `https://*.plaid.com` rather than the enumerated hosts Plaid Link needs; unlike the recorded `style-src`/dev `unsafe-eval` trade-offs, this scope has no design record.
- `[prior]` **Multi-user blockers, noted for completeness.** Hardcoded `client_user_id: 'spendright-user'` (`src/lib/plaid.ts:140`) and no audit trail on destructive/mutating routes — consistent with the accepted single-user model, but accountability/non-repudiation gaps before any authenticated/multi-user posture.

## Resolved / not re-raised

- **esbuild ≤0.24.2 advisories via `drizzle-kit` (dev-only)** — formally accepted in `dev-dependency-advisories-accepted.md`; facts re-verified this audit (`npm audit --omit=dev`: 0 vulnerabilities). Per that record, not counted as an open concern.
