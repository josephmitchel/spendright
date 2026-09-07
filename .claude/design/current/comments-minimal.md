---
name: comments-minimal
description: Code comments are near-zero — bare Design markers, Verified-on claims, and rare 1-line constraints only; no orientation lines, rationale prose, or cross-module claims. Purpose is derived from the code first, the design records second
tags: [Design markers, Verified-on, scripts/check-design-refs.mjs, code comments]
date: 2026-09-07
---

Decided by the user 2026-09-06 after a quality audit found the prose surface (~1,180 comment lines) rivaling the code, and tightened by the user 2026-09-07 ("keep comments to a minimum" — a full strip pass took src+scripts from ~837 comment lines to ~246, most of those bare markers or functional JSDoc/@ts-check annotations). Agents must derive the purpose of code primarily from what the code actually does, and secondarily from this design folder.

A comment is allowed to be: a bare `Design: <record-name>` marker (name-checked by lint) where the code's shape is genuinely non-obvious without the record, a `Verified-on: <package>@<version>` marker plus the one-line claim it covers (version-checked by lint), or a rare 1-line local constraint the code cannot show (lock ordering, a wire-format fact, why a check is shaped oddly) whose omission would likely cause a bug. Functional annotations (eslint directives, `@ts-check`, JSDoc types in .mjs) don't count as comments. Not allowed: orientation/section lines, rationale prose of any length, restatements of record content, doc URLs, authoritative cross-module claims, and audit/history narration — that context belongs in these records. When adding new code, default to zero comments.
