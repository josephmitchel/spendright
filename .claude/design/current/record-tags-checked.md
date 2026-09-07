---
name: record-tags-checked
description: Lint verifies the record→code direction — every code-shaped tag in a current design record must still name something in the tree; a tag with whitespace is a concept and is never checked
tags: [scripts/check-record-tags.mjs, scripts/check-design-refs.mjs, npm run lint, tags frontmatter]
date: 2026-09-07
---

Decided by the user 2026-09-07 after a quality audit (three independent passes) found five current records describing deleted or renamed machinery — two of them contradicting a third record about the same module — while `npm run lint` stayed green: `check-design-refs.mjs` only validates the code→record direction (a `Design:` marker names a live record), and the manual reconcile-on-edit discipline in `DESIGN.md` had already failed within a day of the records being written.

`scripts/check-record-tags.mjs` closes the reverse direction: every tag in a `current/` record's frontmatter that does not contain whitespace must resolve against the tree — as a literal substring of the checked files (the shared source walk plus `package.json`, `tsconfig.json`, and `drizzle/*.sql`, since records cite npm scripts, compiler options, and columns only migration history still names), as an existing path, as a known basename (`TransactionTable.tsx`), or, for a `table.column` pair, as both snake_case halves separately (the dotted form never appears verbatim in schema or SQL). A failing tag means either the code changed and the record body likely drifted with it (reconcile the record), or the tag names a concept or something external (reword it with a space — the whitespace rule is the deliberate opt-out, so no allowlist file exists). Bodies are prose and stay on the manual discipline; tags are the machine-checkable layer, which is a reason to keep tagging records with real identifiers. Sibling of [[verified-claims-checked]] and the same enforced-not-habitual upgrade as [[promise-discipline-linted]].
