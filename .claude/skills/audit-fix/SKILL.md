---
name: audit-fix
description: apply fixes to the problems found within an audit
---

When this skill is invoked, it means the user wants to fix the issues that were raised in a recent audit.

## Instructions

First, confirm with the user which audit they are selecting (it will almost always be the most recent audit so always recommend that one) and what concern level they want to address (just major, major & moderate, all, etc.).

After you know what audit it is, navigate to that audit's folder — audits live under `.claude/audit/<branch>` for the current branch (`git branch --show-current`), gitignored and local to this machine. Each concern is its own `.md` file with YAML frontmatter, filed in a per-characteristic subfolder of the run folder (older audits kept them flat at the root) — gather them across all subfolders, then select the ones whose `level` matches what the user requested, skipping any with `status: resolved`. Familiarize yourself with those concerns and the code they point at.

Then walk the user through the selected concerns **one at a time** (AskUserQuestion, one concern per prompt). For each concern, briefly state what it is and offer a few genuinely distinct fix approaches — grounded in the actual code, with the concern file's suggested direction as one option and your recommended option marked — plus an **Ignore** option that skips the concern this session (it stays open for the next audit; nothing is recorded). Don't fix anything during this walkthrough: collect a decision for every concern first, then apply all the chosen fixes in one pass so related changes land coherently. If, while implementing, a chosen approach turns out not to work as presented, come back and ask rather than silently substituting another. Never assume, no stupid questions.

**Never edit the concern files themselves** — not to mark progress, not to record a fix. `/audit` is the sole author of concern state: the next audit re-verifies every concern and marks it `resolved` only after confirming the fix in the codebase.
