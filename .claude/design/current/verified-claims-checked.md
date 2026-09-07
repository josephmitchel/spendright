---
name: verified-claims-checked
description: Comments asserting reverse-engineered facts about third-party package internals carry a Verified-on marker that scripts/check-verified-claims.mjs checks against the installed version on every lint
tags:
  [
    scripts/check-verified-claims.mjs,
    Verified-on,
    src/instrumentation.ts,
    src/lib/global-singleton.ts,
    npm run lint,
  ]
date: 2026-09-06
---

Several comments assert verified-by-hand facts about third-party internals: Next's handling of a rejected `register()` (instrumentation), the bundler's per-graph module duplication (global singleton). Their "re-verify on every bump" instructions used to live only in prose. Each such claim now carries a `Verified-on: <package>@<version>` marker line; `scripts/check-verified-claims.mjs` (run by `npm run lint`, beside the design-ref checker) fails when a marker no longer matches the installed version's major.minor. New claims of this kind must add a marker.

Narrowed 2026-09-06 (user decision): `node@` markers — and their rule tying lint to the running Node's major.minor, which failed `npm run lint` on every routine Node minor release — were removed along with the bind assertion that carried the repo's only such marker ([[runtime-bind-assertion]]). Markers now cover npm packages only.

Raised by the 2026-09-06 quality audit and confirmed by the user.

Extended 2026-09-06 (follow-up audit, user-confirmed): the convention now also covers the dependency-behavior claims the app's error handling and redaction rest on — drizzle's `DrizzleQueryError`/`cause` wrapping and SQL-bearing messages (`src/lib/errors.ts`), axios's config-on-the-error and zero default timeout (`src/lib/log.ts`, `src/lib/plaid.ts`), pg's lenient connection-string handling (`src/lib/env.ts`), and drizzle's `values([])`/`notInArray([])`/missing-field-DEFAULT behaviors (`scripts/seed-cards.ts`, `src/lib/sync-persist.ts`). The checkers also walk the repo root's config files (`scripts/lib/source-files.mjs`), which carry `Design:` markers of their own — `promise-discipline-linted` is cited only from `eslint.config.mjs`, so before this a retired record could strand that marker with lint still green. Claims about Plaid's _API_ semantics (empty `next_cursor`, the 500-row `count` maximum) carry no npm marker on purpose: they are documented behavior versioned by the pinned `Plaid-Version` header, not by the SDK package.
