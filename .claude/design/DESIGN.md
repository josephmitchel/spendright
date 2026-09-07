This folder (`.claude/design`) is a record that agents must maintain in order to capture the design direction of the project. As an agent, you must make edits to this record as the user makes decisions about the project.

The primary purpose of this record is to help agents remember design decisions made by the user so they don't continously flag deliberate design decisions as issues or decisions that need to be made during an audit.

# Records vs. code comments

Agents derive the purpose of code primarily from what the code does, and secondarily from this design folder. Code comments are deliberately minimal (decided 2026-09-06, see `current/comments-minimal.md`): a comment may be a `Design: <record-name>` marker (verified against this folder by `scripts/check-design-refs.mjs` on every lint), a `Verified-on:` marker with its one-line claim, a one-sentence orientation line, or a short (1–2 line) local constraint the code cannot show. Comments must not restate a record's rationale or make authoritative cross-module claims ("the only X", "can never", "single source of truth") — such prose drifts from the code without failing any check. When editing a record, grep for its name in `src/` and `scripts/` and reconcile any comment that repeats what changed.

# Folder Structure

- `current/`: contains `.md` files representing info about the current decided-on design direction of the application. During an audit, if the codebase does not reflect the design presented in this folder, flag it to the user.
- `retired/`: contains `.md` files representing info about design directions for the application that have been walked back or rejected. During an audit, if the codebase reflects any of the design presented in this section, flag it to the user.

# File Structure

Each file in `current/` or `retired/` represents something that was raised to the user by agent and confirmed by the user. Each `.md` file must contain the following structure:

```markdown
---
name: file-name
description: description of design decision
tags: list of key functions, methods, classes, etc. that relate to this decision
date: date/time of when this decision was made
---

Brief summary of what this decision is. Keep it concise and to the point.
```
