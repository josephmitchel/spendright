---
characteristic: "security"
---
# Summary

All four auditors agree the security posture is unchanged since the last audit — the only interim changes were non-functional design-record comment updates from the design-corpus compaction. The prior Moderate (plaintext financial data at rest, undocumented) remains resolved: the decision survived the compaction and now lives in `data-at-rest-encryption.md` with rationale and revisit triggers. The same eight prior Minor concerns remain open; independent sweeps (SQL injection, IDOR, XSS, path traversal, secrets in git history, CORS/headers, `npm audit`) found nothing new. Accepted risks were correctly respected: the dev-only esbuild/drizzle-kit audit chain (`accepted-audit-risks.md`) and the no-auth single-user-localhost posture (`single-user-localhost-no-auth.md`) were not re-raised.

Totals: 0 Major, 0 Moderate, 8 Minor (all prior, 0 new).

# Major Concerns

None.

# Moderate Concerns

None. (`[prior — resolved]` Plaintext financial data at rest is now formally recorded in `.claude/design/current/data-at-rest-encryption.md` with explicit revisit triggers; content survived the design-folder compaction intact.)

# Minor Concerns

All flagged by all 4 auditors:

- `[prior]` **`npm run dev`'s loopback bind is overridable.** `package.json` — `"dev": "next dev -H 127.0.0.1"` places the flag before user args, so `npm run dev -- -H 0.0.0.0` wins under last-wins CLI semantics. `scripts/start.mjs` fixes this correctly for `start` but the same fix was never applied to `dev`.

- `[prior]` **CSRF/Origin check passes silently when `Origin` is absent.** `src/proxy.ts:76-85` only enforces same-origin `if (origin && ...)`; an Origin-less request from any local process reaching `127.0.0.1:3000` bypasses the check. Recorded as intentional (curl support) in `non-local-request-guard.md`, but residual attack surface remains.

- `[prior]` **Encryption-key validation checks shape only, not entropy.** `ENCRYPTION_KEY_PATTERN` (`src/lib/crypto.ts:7`) accepts any 64-hex string, all-zeros included, with no weak-key check.

- `[prior]` **Log redaction is allow-list-shaped, not default-deny.** `loggableError` (`src/lib/log.ts:26-41`) only redacts when `isAxiosError === true`; any other error shape carrying sensitive fields (tokens, connection strings) logs verbatim.

- `[prior]` **`decrypt()` failure messages leak scheme details.** `src/lib/crypto.ts:45-51, 69-74` throws client-facing `PublicError`s naming `ENCRYPTION_KEY`/`ENCRYPTION_KEY_PREVIOUS` and the `iv:tag:ciphertext` format. Reconnaissance value only.

- `[prior]` **`institutionLogo` blob is size-unbounded and structure-unvalidated.** `src/db/schema.ts:67` has no length constraint; `src/lib/image-mime.ts` sniffs only the base64 text prefix with no decoded-byte validation or size cap before serving via the logo route. Mitigated by `X-Content-Type-Options: nosniff` and CSP `object-src 'none'`.

- `[prior]` **CSP `connect-src` uses a broad Plaid wildcard.** `buildCsp` (`src/proxy.ts:18`) allows `https://*.plaid.com` rather than enumerating the hosts Plaid Link needs; unlike the CSP's other trade-offs (recorded in `nonce-based-csp.md`), this scope has no design record.

- `[prior]` **Multi-user blockers, noted for completeness.** `client_user_id: 'spendright-user'` remains hardcoded (`src/lib/plaid.ts:159`), and no destructive/mutating route records an audit trail — consistent with the accepted single-user model, but accountability/non-repudiation gaps to close before any authenticated or multi-user posture.
