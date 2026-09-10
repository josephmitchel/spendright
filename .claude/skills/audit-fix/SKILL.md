---
name: audit-fix
description: apply fixes to the problems found within an audit
---

When this skill is invoked, it means the user wants to fix the issues that were raised in a recent audit.

## Instructions

First, confirm with the user which audit they are selecting (it will almost always be the most recent audit so always recommend that one) and what concern level they want to address (just major, major & moderate, all, etc.).

After you know what audit it is, navigate to that audit's folder — audits live under `.claude/audit/<branch>` for the current branch (`git branch --show-current`), gitignored and local to this machine. Each concern is its own `.md` file with YAML frontmatter — select the ones whose `level` matches what the user requested, skipping any with `status: resolved`. Familiarize yourself with those concerns, then come up with a plan to address every one of them. Ask the user any questions if you are unsure about what direction you should go with a change. Never assume, no stupid questions.

**Never edit the concern files themselves** — not to mark progress, not to record a fix. `/audit` is the sole author of concern state: the next audit re-verifies every concern and marks it `resolved` only after confirming the fix in the codebase.
