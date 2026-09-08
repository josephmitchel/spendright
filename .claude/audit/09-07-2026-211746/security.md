---
characteristic: "security"
---
# Summary

All four auditors agree, with independent sweeps (SQL parameterization, IDOR/ownership checks, path traversal, XSS vectors, secrets in git history, `npm audit`) converging on zero new findings. The prior audit's sole Moderate — financial data stored in plaintext at rest with no recorded decision — is resolved: `.claude/design/current/financial-data-plaintext-at-rest.md` (2026-09-07) formally records the trade-off with rationale (device-compromise threat model, full-disk encryption as the appropriate control) and explicit revisit triggers (remote/hosted DB, backups leaving the machine, multi-user posture).

The same eight prior Minor residual gaps carry forward untouched — no code in this area changed since the last audit. The codebase remains security-mature for its stage: parameterized queries throughout, loopback bind + CSRF Origin check + nonce-based CSP defense-in-depth, AES-256-GCM encrypted access tokens with a working rotation path, allow-listed error messages, 0600 `.env.local`, clean `npm audit --omit=dev`, and no webhook or other internet-reachable surface.

Totals: 0 Major, 0 Moderate (1 prior resolved this cycle), 8 Minor (all prior, 0 new).

# Major Concerns

None.

# Moderate Concerns

None open. `[prior — resolved]` Plaintext financial data at rest, now a formally recorded accepted trade-off in `financial-data-plaintext-at-rest.md`.

# Minor Concerns

- `[prior]` **`npm run dev`'s loopback bind is overridable.** `package.json` places `-H 127.0.0.1` before user args, so `npm run dev -- -H 0.0.0.0` wins under last-wins CLI semantics. `scripts/start.mjs` closes exactly this hole for `start` but the fix was never applied to `dev`.
- `[prior]` **CSRF/Origin check passes silently when `Origin` is absent.** `src/proxy.ts:75-84` enforces same-origin only `if (origin && ...)`, so any local process reaching `127.0.0.1:3000` without an Origin header can drive state-changing endpoints. Recorded as intentional (curl support) in `non-local-request-guard.md`; carried as residual attack surface.
- `[prior]` **Encryption-key validation checks shape only, not entropy.** `ENCRYPTION_KEY_PATTERN` (`src/lib/crypto.ts:7`) accepts any 64-hex string, including all-zeros, with no weak-key warning.
- `[prior]` **Log redaction is allow-list-shaped, not default-deny.** `loggableError` (`src/lib/log.ts:26-41`) only redacts objects with `isAxiosError === true`; other error shapes carrying sensitive fields would log verbatim.
- `[prior]` **`decrypt()` failure messages leak scheme details.** `src/lib/crypto.ts:45-51, 69-74` throws `PublicError`s naming `ENCRYPTION_KEY`/`ENCRYPTION_KEY_PREVIOUS` and the `iv:tag:ciphertext` format, passed through the client-facing allow-list. Reconnaissance value only.
- `[prior]` **`institutionLogo` blob is size-unbounded and structure-unvalidated.** No length constraint in `src/db/schema.ts:67`; `src/lib/image-mime.ts` sniffs only the base64 text prefix with no decoded-byte validation or size cap. Mitigated by `nosniff` and CSP `object-src 'none'`.
- `[prior]` **CSP `connect-src` uses a broad Plaid wildcard.** `buildCsp` (`src/proxy.ts:18`) allows `https://*.plaid.com` rather than enumerating the hosts Plaid Link needs; unlike the other CSP trade-offs now recorded in `nonce-based-csp.md`, this scope has no design record.
- `[prior]` **Multi-user blockers, noted for completeness.** Hardcoded `client_user_id: 'spendright-user'` (`src/lib/plaid.ts:158`) and no audit trail on destructive/mutating routes — consistent with the accepted single-user model, but accountability/non-repudiation gaps to close before any authenticated/multi-user posture.
