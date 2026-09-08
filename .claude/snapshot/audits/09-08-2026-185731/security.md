---
characteristic: 'security'
---

# Summary

Three auditors traced every claim in SNAPSHOT.md's "Security posture" section to source and verified all of them: loopback-only enforcement (including Host-confusion protection and the unoverridable `-H 127.0.0.1` bind), per-request nonce CSP with `strict-dynamic`, same-origin CSRF check, AES-256-GCM token encryption with key-rotation fallback, unconditional axios-error redaction before logging, error envelopes that never echo `err.message`, TLS required for non-loopback `DATABASE_URL`, parameterized queries throughout, access tokens excluded from every API response, `.next` permission tightening that fails closed, clean production dependency graph (`npm audit --omit=dev`: 0), and no secrets in git history. Every gap (no auth, plaintext financial data at rest, no webhook verification) is an explicit snapshot deferral with unmet revisit triggers. Two auditors reported zero findings; one raised a single Minor supply-chain observation. All findings are `[new]` (first audit of the era).

# Major Concerns

None.

# Moderate Concerns

None.

# Minor Concerns

- `[new]` **The secret-redaction safety net rides unpinned/transitive dependency versions.** `src/lib/log.ts`'s `loggableError` — the one control standing between a Plaid API failure and `PLAID-SECRET` plus decrypted access tokens landing in server logs — duck-types axios error shapes, annotated `Verified-on: axios@1.20.0`. But axios is not a direct dependency (it arrives transitively via `plaid@^41.4.0`), and `pg`/`drizzle-orm` are on caret ranges. `npm ci` reproduces today's exact versions, but a bare `npm install` after a dependency bump could silently move axios to a version whose error shape breaks the redaction — a quiet confidentiality regression on the app's most sensitive secrets, with no automated check to catch it. Cheap mitigation: pin axios directly, or add a startup/test assertion that a synthetic axios-shaped error actually redacts.
