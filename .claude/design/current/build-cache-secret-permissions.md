---
name: build-cache-secret-permissions
description: Turbopack's cache under .next persists env secrets into world-readable files, so .next is chmod'd go-rwx around every build, dev session, and start — one policy script, scripts/tighten-next.mjs, invoked from all four sites, uniformly fail-closed; files written during a live dev session are an accepted attended-work residual
tags:
  [
    .next/cache/turbopack,
    scripts/tighten-next.mjs,
    scripts/start.mjs,
    package.json postbuild,
    ENCRYPTION_KEY,
    PLAID_SECRET,
    PLAID_CLIENT_ID,
    chmodSync,
    process.platform,
  ]
date: 2026-09-06
---

Found by the 2026-09-06 security audit: Turbopack records `process.env` reads as cache dependencies and persists name→value pairs — the literal `ENCRYPTION_KEY`, `PLAID_SECRET` and `PLAID_CLIENT_ID` — into `.next/cache/turbopack/**/*.sst` (and `.next/dev/cache/turbopack/**/*.sst`) created 0644. That silently undoes `.env.local`'s 0600: any other local account could read the AES key protecting every stored Plaid access token, and the values ride along in wholesale copies of the project directory (backups, zips, synced folders). Verified not served over HTTP and not in git.

Mitigation, confirmed 2026-09-06: `chmod -R go-rwx .next` runs around every build (`prebuild` creates-then-tightens the directory so its 0700 mode survives even a failed build — `postbuild` only fires on success and covers the files; `next build` cleans inside distDir without recreating it, so the directory mode stands), before every dev session (`predev` — otherwise `next dev` recreating a deleted `.next` would leave the directory itself 0755 under the default umask), and at every `npm run start` (scripts/start.mjs). Single definition, confirmed 2026-09-06 (raised by a quality audit that found the policy hand-copied across four sites with only start.mjs checking the chmod succeeded): all four sites invoke `scripts/tighten-next.mjs`, which creates the directory then tightens it and is uniformly fail-closed — a chmod that does not succeed stops the run (npm pre/post hooks abort on a non-zero exit; start.mjs checks the spawn and refuses to start the server). A policy change is now one edit. Residual: files Turbopack writes _while_ a `next dev` session is running are 0644 until the next build/dev/start re-tightens them, though the 0700 `.next` directory blocks traversal for as long as it stands — accepted because dev sessions are short-lived, attended work ([[non-local-request-guard]]). Rotating `ENCRYPTION_KEY` is warranted only if the directory was actually shared, and no longer costs every stored token ([[data-at-rest-encryption]]).

Implementation change 2026-09-07 (raised by the compatibility/flexibility audits): the script no longer shells out to the Unix `chmod` binary — which made every `npm run dev|build|start` abort with a raw spawn failure on Windows — and instead walks `.next` with Node's `fs` (`chmodSync` to `mode & 0o700`), still fail-closed on any POSIX error. On `win32` it skips with a note and exits 0: POSIX group/other bits don't exist there, and NTFS profile ACLs already isolate per-user, so the skip is not fail-open.
