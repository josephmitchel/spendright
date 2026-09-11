---
name: audit-fix
description: apply fixes to the problems found within an audit
---

When this skill is invoked, it means the user wants to fix the issues that were raised in the most recent audit.

## Instructions

Audit-fix always targets the **latest audit** on the current branch — audits live under `.claude/audit/<branch>` (`git branch --show-current`), gitignored and local to this machine; the latest is the run folder with the newest timestamp name. Do not ask the user which audit to use. If the branch has no audit folders, stop and tell the user no audits have been run on this branch yet (`/audit` creates one). Each concern is its own `.md` file with YAML frontmatter, filed in a per-characteristic subfolder of the run folder (older audits kept them flat at the root) — gather them across all subfolders.

Next, read the run folder's `FIXLOG.md` if it exists (format below). Concerns already logged there — fixed or ignored — are **addressed**: never re-offer them. The remaining candidates are the open concern files (skip `status: resolved`) with no fixlog entry. If there are none, stop and tell the user the latest audit has been fully addressed — a fresh `/audit` is the way to get new work.

Ask the user what concern level they want to address (just major, major & moderate, all, etc.), then select the candidates whose `level` matches. Familiarize yourself with those concerns and the code they point at.

Then walk the user through the selected concerns **one at a time** (AskUserQuestion, one concern per prompt). Every prompt must name the concern's characteristics (e.g. `[security, reliability]`) alongside its title so the user can locate the concern file. For each concern, briefly state what it is and offer a few genuinely distinct fix approaches — grounded in the actual code, with the concern file's suggested direction as one option and your recommended option marked — plus an **Ignore** option that skips the concern this session (it stays open for the next audit). Don't fix anything during this walkthrough: collect a decision for every concern first, then apply all the chosen fixes in one pass so related changes land coherently. If, while implementing, a chosen approach turns out not to work as presented, come back and ask rather than silently substituting another. Never assume, no stupid questions.

Once the pass is complete, for each concern whose fix was actually applied, edit its concern file: set `status: resolved` in the frontmatter and append a brief line describing the fix (what changed, in which files, and how it was verified — tests run, behavior checked). Ignored concerns are never edited — they stay open for the next audit. Then record every decision in `FIXLOG.md` at the run folder's top level (create it if absent), appending one line per concern:

```markdown
- <slug> [<primary characteristic>] — fixed | ignored — MM-DD-YYYY
```

Log `fixed` only for fixes actually applied and `ignored` for Ignore decisions; a concern whose fix was abandoned mid-implementation gets no entry, so a later run re-offers it. Ignored concerns count as addressed for this audit but remain open for the next `/audit` to re-verify.

After logging, if every open major/moderate concern in this audit now has a fixlog entry, run `npm run audit:gate` — it writes the committed `.claude/audit-gate.json` stamp that the `audit-gate` CI check requires before a PR can merge. Remind the user to commit the stamp with the branch.

The only concern-file edit audit-fix ever makes is the resolved-marking above, and only for fixes it actually applied — never for ignores, never to mark partial progress. Everything else about concern state belongs to `/audit`; if a claimed fix didn't hold, the next audit reopens the concern under the same slug with its original `first-seen`.
