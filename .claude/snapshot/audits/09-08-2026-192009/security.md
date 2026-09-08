---
characteristic: 'security'
---

# Summary

All three auditors independently re-traced the full "Security posture" section of SNAPSHOT.md and found every claim accurate in current code: loopback-only enforcement with Host-confusion-safe parsing and same-origin CSRF checks (`src/proxy.ts`), per-request nonce CSP with `strict-dynamic`, AES-256-GCM token encryption with key-rotation fallback (`src/lib/crypto.ts`), TLS-enforced `DATABASE_URL` (`src/lib/env.ts`), fully parameterized SQL with no injection surface, `accessToken`/`plaidTransaction` excluded from every client-served column set, magic-byte-sniffed logo serving, no XSS sinks, no secrets anywhere in git history, and `npm audit --omit=dev` clean (the dev-only esbuild chain matches the snapshot's blessed deferral). The explicitly deferred gaps (no auth, plaintext financial data at rest, no webhook signature verification) all remain within their unmet revisit triggers and are correctly not findings. The single prior Minor concern remains open; no new concerns were found by any auditor.

# Major Concerns

None.

# Moderate Concerns

None.

# Minor Concerns

- `[prior]` **Secret-redaction safety net rides an unpinned transitive `axios`** (`src/lib/log.ts`, `package.json`). `loggableError` — the sole control preventing `PLAID-SECRET` and decrypted Plaid access tokens from landing in server logs on an axios failure — duck-types the axios error shape (`Verified-on: axios@1.20.0`), but axios is not a direct dependency: it arrives transitively via `plaid@^41.4.0` on a caret range (`^1.7.4` per `package-lock.json`). No `overrides` pin and no startup/smoke assertion exercises the redaction against a synthetic axios-shaped error, so a dependency bump could silently break redaction of the app's most sensitive secrets. Cheap mitigation unchanged from the prior audit: pin axios directly (or via `overrides`), or add a lightweight assertion that a synthetic axios-shaped error actually redacts. Unaddressed since the last audit (the `fbf2912` fix commit was scoped to Major/Moderate items).
