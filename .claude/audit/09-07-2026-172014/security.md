---
characteristic: 'security'
---

# Summary

Four independent auditors reviewed the codebase against ISO/IEC 25010:2023 §3.6 (confidentiality, integrity, non-repudiation, accountability, authenticity, resistance), all evaluating against the documented single-user/localhost-only threat model (`single-user-localhost-no-auth.md`) rather than a generic internet-facing standard. All four independently verified — not just re-read — that the fixes from the three prior security-audit cycles are actually present and correct: loopback-only bind with last-wins CLI semantics (`scripts/start.mjs`), the `src/proxy.ts` Host/forwarded-header/same-origin guard, `frame-ancestors 'none'` + `X-Frame-Options: DENY`, AES-256-GCM token encryption with validated keys (`src/lib/crypto.ts`), access-token and raw-payload columns excluded from every served projection, allow-listed error messages, Axios log redaction, `.next` cache permission tightening, fully parameterized queries, no secrets in git or the client bundle, and a clean `npm audit --omit=dev`. **No auditor found a new major issue.** The deliberate no-auth posture is confirmed still accurately scoped and remains the documented blocker before any deployment beyond localhost.

# Major Concerns

None. (The unauthenticated `/api/**` surface is a documented, accepted design decision — safe only under the loopback-only model, and explicitly the first thing that must change before any real deployment. Confirmed still accurately scoped; not re-litigated.)

# Moderate Concerns

- **CSP provides no script/XSS containment** (`next.config.ts:10-18`) — only `frame-ancestors 'none'` is set; no `default-src`/`script-src`/`object-src`, no `X-Content-Type-Options: nosniff`, no `Referrer-Policy`. Verified no active XSS sink exists today (no `dangerouslySetInnerHTML`/`eval`/`new Function` in `src/`), but nothing would contain one introduced later — e.g. via the unvalidated Plaid-sourced `institutionLogo`/`institutionPrimaryColor` columns (`src/db/schema.ts:63-64`). This is the "security enhancement mechanism" the ISO resistance sub-characteristic asks for, currently absent.
- **No key-rotation path for `ENCRYPTION_KEY`** (`src/lib/crypto.ts`) — one fixed key, no key-ID in the stored `iv:tag:ciphertext` format. A suspected compromise forces either restoring the old key or re-linking every institution (per `decrypt()`'s own catch path, `crypto.ts:45-54`). Unlike other hardening decisions, no design record shows this tradeoff was deliberately accepted.
- **No TLS enforcement on the Postgres connection** — flagged by 2 auditors. `src/lib/env.ts:5-15` validates only the URL scheme, never `sslmode`; harmless with local Postgres, but encrypted tokens and financial data would traverse the network in cleartext if `DATABASE_URL` is ever pointed off-host without `sslmode=require`. Suggested: enforce/validate TLS when the host isn't loopback, as a companion to the existing scheme check.
- **`next dev` residual DNS-rebinding exposure is live, not historical** — Next's `/__nextjs_launch-editor` and `/__nextjs_attach-nodejs-inspector` endpoints sit ahead of `src/proxy.ts`; the inspector endpoint exposes the Node process holding `ENCRYPTION_KEY` and decrypted tokens. Already documented as "not fixable in this repo" (`non-local-request-guard.md`) with `next start` as the mitigation — flagged by 3 auditors as still-open and worth procedural discipline (treat `next dev` as short-lived attended work; two auditors verified the behavior is unchanged in `next@16.3.4`).

# Minor Concerns

- **Log redaction only special-cases Axios errors** (`src/lib/log.ts:26-41`) — any other credential-bearing thrown object would log verbatim; no current call site does this, but the invariant is maintained by convention rather than type.
- **`ENCRYPTION_KEY` validation doesn't reject degenerate keys** (`src/lib/crypto.ts`) — the `/^[0-9a-fA-F]{64}$/` pattern accepts e.g. 64 zeros; length/charset only.
- **Institution logo trusted without validation** (`src/lib/plaid.ts`, `src/app/page.tsx:80-84`) — base64 blob from Plaid persisted and rendered with no format/size bound; low risk while Plaid is a trusted upstream.
- **`decrypt()` failure message reveals the internal storage format** (`src/lib/crypto.ts:32-39`) — mild reconnaissance value only if ever exposed beyond localhost; appears intentional under the error allow-list pattern.
- **No accountability/audit trail for destructive or mutating actions** (`DELETE /api/items/[itemId]`, transaction category `PATCH`) — consistent with the single-user model; would need addressing before any multi-user/authenticated posture.
- **Fixed `client_user_id` passed to Plaid** (`src/lib/plaid.ts`) — consistent with single-user design; a hard blocker for ever distinguishing users at the Plaid layer.
- **`isLoopbackIp` completeness note** (`src/proxy.ts`) — handles the `::ffff:` prefix explicitly but is a narrow defense-in-depth layer; the loopback bind is the real enforcement per the design doc's own framing. No practical exploit path found.
- **Dev-dependency esbuild advisory chain** (`drizzle-kit → @esbuild-kit → esbuild`, GHSA-67mh-4wv8-2f99) — already reviewed and accepted in `dev-dependency-advisories-accepted.md` as dev-only and unreachable at runtime; noted for completeness only.
