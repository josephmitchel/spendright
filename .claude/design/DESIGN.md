This folder (`.claude/design`) is a record that agents must maintain in order to capture the design direction of the project. As an agent, you must make edits to this record as the user makes decisions about the project.

The primary purpose of this record is to help agents remember design decisions made by the user so they don't continously flag deliberate design decisions as issues or decisions that need to be made during an audit.

<!-- Edit, reference, and draw info from this record silently (unless otherwise instructed). This for agents, not for the user.  -->

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

