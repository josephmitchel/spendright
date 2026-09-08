---
characteristic: "security"
---
# Summary

Four auditors reviewed the codebase against ISO/IEC 25010:2023 §3.6. No Major concerns were found. The security posture is unusually mature for the project's stage, and each auditor independently verified the implementation against the design records rather than taking them at face value: AES-256-GCM token encryption with a working rotation path, fully parameterized database access (including the one dynamic-identifier case via `sql.identifier()` in `src/lib/sync-persist.ts:52`), unoverridable loopback binding in `scripts/start.mjs` plus the defense-in-depth `src/proxy.ts` guard (non-loopback Host/X-Forwarded rejection, same-origin CSRF check), a per-request nonce-based CSP with `strict-dynamic` (the prior round's `'unsafe-inline'` finding is confirmed fixed), error-message allow-listing with redacted Axios logging, tightened `.next` build-cache permissions, `.env.local` at 0600, no secrets reachable from client bundles, and a clean production `npm audit`. The recorded no-auth/localhost-only decision was respected by all four auditors, with its compensating controls independently re-verified.

Two Moderate concerns surfaced, each found by one auditor and not contradicted by the others.

# Major Concerns

None.

# Moderate Concerns

- **Financial data is stored in plaintext at rest; only the Plaid access token is column-encrypted** — `src/db/schema.ts` stores balances, transaction amounts, merchant names, and the full raw Plaid payload (`transactions.plaidTransaction` jsonb) in cleartext. `access-tokens-encrypted.md` scopes encryption to the token only, and unlike the other accepted boundaries in `deployment-boundaries.md`, there is no recorded decision or revisit trigger for the financial data itself. A compromise of the Postgres data files or backups exposes full transaction history without needing the encryption key. May be an acceptable trade-off at the single-user/local-Postgres stage, but it should be an explicit, recorded one.

- **Vulnerable transitive dev dependency: esbuild ≤0.24.2 via `drizzle-kit`** — `npm audit` reports 4 moderate advisories rooted in `@esbuild-kit/core-utils`'s bundled esbuild (GHSA-67mh-4wv8-2f99, CWE-346: any website can send requests to the esbuild dev server and read responses). Production dependencies are clean (`npm audit --omit=dev`: 0), and exploitation requires a developer manually running `npx drizzle-kit studio` while an untrusted page is open. Bumping `drizzle-kit` or pinning esbuild via `overrides` closes it.

# Minor Concerns

- **`npm run dev`'s loopback bind is overridable, unlike `start`'s** — `package.json` places `-H 127.0.0.1` before user args, so `npm run dev -- -H 0.0.0.0` wins under Next's last-wins CLI semantics. `scripts/start.mjs` deliberately appends the flag after user args to close exactly this hole for `start`; the same ordering fix isn't applied to `dev` — where Next's internal `/__nextjs_*` endpoints also bypass the proxy guard.

- **CSRF/Origin check passes silently when the `Origin` header is absent** — `src/proxy.ts` only enforces same-origin `if (origin && ...)`, so any local process reaching `127.0.0.1:3000` can drive every state-changing endpoint (item delete, token exchange). Intentional per design commentary (curl support), but worth confirming the "loopback = trusted" residual boundary as local attack surface grows.

- **Encryption-key validation checks shape only, not entropy** — `src/lib/crypto.ts:7` accepts any 64-hex string, including all zeros; no weak-key warning. Low risk given the documented `openssl rand -hex 32` path.

- **Log redaction is keyed on Axios error shape, not default-deny** — `src/lib/log.ts:26-41` only redacts objects with `isAxiosError === true`; other error types carrying sensitive fields would log verbatim. The mechanism is allow-list-shaped rather than structurally guaranteed, despite `plaid-error-log-redaction.md` framing it as covering every site.

- **`decrypt()` failure messages leak scheme details** — `src/lib/crypto.ts:45-51, 69-74`: `PublicError`s naming `ENCRYPTION_KEY`/`ENCRYPTION_KEY_PREVIOUS` and the `iv:tag:ciphertext` format pass the allow-list to the client. Reconnaissance value only, and only if ever reachable past localhost.

- **`institutionLogo` blob is size-unbounded and structure-unvalidated** — `src/db/schema.ts:67` has no length constraint and `src/lib/image-mime.ts` sniffs only the base64 text prefix (no decoded-byte or structure validation, no size cap) before serving. Fine while Plaid is the only writer; mitigated by `nosniff` and CSP `object-src 'none'`.

- **CSP `connect-src` uses a broad Plaid wildcard** — `src/proxy.ts` (`buildCsp`, line 18) allows `https://*.plaid.com`, broader than the specific hosts Plaid Link needs and looser than the rest of the tightly scoped CSP. Enumerate the actual hosts if Plaid publishes them.

- **Multi-user blockers, noted for completeness** — fixed `client_user_id: 'spendright-user'` (`src/lib/plaid.ts:140`) and no audit trail on destructive/mutating routes are consistent with the accepted single-user model but must be addressed before any authenticated or multi-user posture (accountability/non-repudiation).
