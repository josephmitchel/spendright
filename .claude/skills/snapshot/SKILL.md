---
name: snapshot
description: capture a snapshot of the current state of the project and codebase
---

Produce (or refresh) `.claude/snapshot/SNAPSHOT.md` — the authoritative record of what this project **is supposed to be** right now: everything intentionally implemented, and everything intentionally absent. Where /audit documents what **shouldn't** be in the codebase, /snapshot documents what **should**. Auditors treat SNAPSHOT.md as ground truth so they stop raising intended behavior as "concerns."

A snapshot is required before any branch is merged into `main` (enforced by the `pre-merge-commit` hook in `scripts/git-hooks/`), so the updated SNAPSHOT.md rides in with the merge.

## Procedure

### 1. Load the draft

Read `.claude/snapshot/SNAPSHOT.md` if it exists — it is your working draft, not the truth; every claim in it must be re-verified in step 2.

**First run only** (file missing): seed the draft from the retired design record in git history. Find the last commit that contained it with `git log --all -1 --format=%H -- .claude/design/current`, list the records with `git show <sha>:.claude/design/current`, and read them via `git show <sha>:.claude/design/current/<name>.md`. The whole `current/` corpus is draft material for the Features/Architecture sections (deliberate decisions and quirks auditors shouldn't flag); `accepted-audit-risks.md` and `deferred-features.md` in particular seed "Intentionally absent / deferred". The user still confirms all of it in step 3 — the retired record may itself have drifted.

### 2. Verify against the code

Explore the codebase thoroughly (spin up Explore agents as needed). Compare it to the draft and collect:

- draft claims that are no longer true
- features/behavior present in code but absent from the draft
- anything where the _intent_ is ambiguous (could be deliberate, could be cruft)

### 3. Interview the user

Ask the user about every delta and every ambiguity — as many questions as it takes to pin down what is intentional. Use AskUserQuestion or plain chat. Do **not** re-ask things the carried-forward draft already settles and the code still confirms.

### 4. Write the snapshot

As soon as the interview is done, write `.claude/snapshot/SNAPSHOT.md` — do not present a draft for approval first. Tell the user it's written and ready for review; they'll look it over and raise any issues, which you fix in the file directly.

### 5. Finish

1. Delete everything under `.claude/snapshot/audits/` — a new snapshot starts a fresh audit era (git history keeps the old eras). The next audit's concerns will all be `status: new`.
2. Once the user has had a look (and any raised issues are fixed), invoke the `audit` skill to run a fresh audit against the new snapshot.

Never commit anything — the user handles all commits; leave changes in the working tree.

## SNAPSHOT.md format

Feature-level depth: what exists and what it's intended to do, not line-by-line behavior specs.

```
---
date: <YYYY-MM-DD>
branch: <branch the snapshot was taken on>
---
# Overview
One paragraph: what the app is and where it's at.

# Features
Each feature that exists, with its intended behavior and any deliberate quirks
(things an auditor might otherwise flag).

# Architecture
Stack, major modules, how they fit together.

# Data model
The entities and how they relate.

# Intentionally absent / deferred
Things deliberately NOT in the codebase (yet): deferred features, accepted
risks, missing tests, seed-data limitations, etc. Auditors must never flag
anything listed here.
```
