---
name: design-consistency-checks
description: Lint mechanically verifies both directions of the record↔code relationship — check-record-tags.mjs requires every code-shaped tag in a current record to still name something in the tree, and check-verified-claims.mjs requires every reverse-engineered claim about a package's internals to carry a Verified-on marker matching the installed version
tags:
  [
    scripts/check-record-tags.mjs,
    scripts/check-design-refs.mjs,
    scripts/check-verified-claims.mjs,
    npm run lint,
    tags frontmatter,
    Verified-on,
    src/instrumentation.ts,
    src/lib/global-singleton.ts,
  ]
date: 2026-09-06
---

## Record tags checked (decided 2026-09-07)

Decided by the user 2026-09-07 after a quality audit (three independent passes) found five current records describing deleted or renamed machinery — two of them contradicting a third record about the same module — while `npm run lint` stayed green: `check-design-refs.mjs` only validates the code→record direction (a `Design:` marker names a live record), and the manual reconcile-on-edit discipline in `DESIGN.md` had already failed within a day of the records being written.

`scripts/check-record-tags.mjs` closes the reverse direction: every tag in a `current/` record's frontmatter that does not contain whitespace must resolve against the tree — as an existing path, a known basename (`TransactionTable.tsx`), a live `table.column` pair, or a word-boundary match in the checked files (the shared source walk plus `package.json` and `tsconfig.json`, since records cite npm scripts and compiler options). A failing tag means either the code changed and the record body likely drifted with it (reconcile the record), or the tag names a concept or something external (reword it with a space — the whitespace rule is the deliberate opt-out, so no allowlist file exists). Bodies are prose and stay on the manual discipline; tags are the machine-checkable layer, which is a reason to keep tagging records with real identifiers. Same enforced-not-habitual upgrade as [[promise-discipline-linted]].

Hardened again 2026-09-07 (user-confirmed after a quality audit found the checker's failure mode was silence — a schema.ts refactor the regex parse missed would quietly demote every table.column tag to the corpus fallback, and a tag naming deleted machinery could pass forever on a mention inside a comment): the schema parse now throws on any anomaly (no builder import, no tables, a table without columns, a pgTable call the split missed — cross-checked against the raw `pgTable(` count), and full-line comments are stripped from the corpus before identifier matching, keeping only `Design:`/`Verified-on:` marker lines, which are the machine-checked comment layer records legitimately cite.

Hardened 2026-09-07 (user-confirmed after a quality audit proved the original checker could not fail for the cases that matter — tags naming the columns migration 0007 dropped exited 0): `drizzle/*.sql` left the corpus, because the append-only migration rule ([[migrations-only]]) means migration text permanently names every identifier the schema ever had, so its coverage decayed with every migration; a `table.column` tag now resolves only against the live tables and columns parsed from `src/db/schema.ts` (a live table with a dead column fails outright, with no substring fallback); identifier tags match on word boundaries rather than raw substrings; and a bare all-lowercase word of five characters or fewer — `run`, `load`, `total`, structurally incapable of failing a substring search — resolves only as an exact table, npm script, or file name, and otherwise must be reworded with a space or replaced by the precise identifier.

## Record citation required (decided 2026-09-07)

Decided by the user 2026-09-07 after the 2026-09-07 maintainability audit found the back-reference blind spot demonstrated on the newest code: two records landed describing `src/lib/money.ts` and the seed provenance validation with no `Design:` marker in the code they describe, so a maintainer reading that code had no in-code signal a record explained the why. `check-design-refs.mjs` now checks the reverse direction too: every record in `current/` must be cited by at least one `Design:` marker in the walked files. A policy/meta record with no single code site (the corpus policy, the comments rule, stage acceptances) opts out explicitly with `code-refs: none` in its frontmatter — an in-record declaration mirroring the whitespace-tag opt-out, so no allowlist file exists. Writing a record about specific new code and adding its marker is now one un-skippable change.

Several comments assert verified-by-hand facts about third-party internals: Next's handling of a rejected `register()` (instrumentation), the bundler's per-graph module duplication (global singleton). Their "re-verify on every bump" instructions used to live only in prose. Each such claim now carries a `Verified-on: <package>@<version>` marker line; `scripts/check-verified-claims.mjs` (run by `npm run lint`, beside the design-ref checker) fails when a marker no longer matches the installed version's major.minor. New claims of this kind must add a marker.

Narrowed 2026-09-06 (user decision): `node@` markers — and their rule tying lint to the running Node's major.minor, which failed `npm run lint` on every routine Node minor release — were removed along with the bind assertion that carried the repo's only such marker ([[runtime-bind-assertion]]). Markers now cover npm packages only.

Raised by the 2026-09-06 quality audit and confirmed by the user.

Extended 2026-09-06 (follow-up audit, user-confirmed): the convention now also covers the dependency-behavior claims the app's error handling and redaction rest on — drizzle's `DrizzleQueryError`/`cause` wrapping and SQL-bearing messages (`src/lib/errors.ts`), axios's config-on-the-error and zero default timeout (`src/lib/log.ts`, `src/lib/plaid.ts`), pg's lenient connection-string handling (`src/lib/env.ts`), and drizzle's `values([])`/`notInArray([])`/missing-field-DEFAULT behaviors (`scripts/seed-cards.ts`, `src/lib/sync-persist.ts`). The checkers also walk the repo root's config files (`scripts/lib/source-files.mjs`), which carry `Design:` markers of their own — `promise-discipline-linted` is cited only from `eslint.config.mjs`, so before this a retired record could strand that marker with lint still green. Claims about Plaid's _API_ semantics (empty `next_cursor`, the 500-row `count` maximum) carry no npm marker on purpose: they are documented behavior versioned by the pinned `Plaid-Version` header, not by the SDK package.
