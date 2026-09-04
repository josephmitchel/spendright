---
name: design-audit
description: audit the codebase to ensure that it is aligned with the decided upon design direction of the project
---

Review the code of the entire codebase (not just the working tree) to ensure that it is aligned with the current design of the project which is outlined in `.claude/design`. Flag any violations to the user with suggestions on how they can be remedied. 

You're job is purely to find design issues -- technical issues, security issues, etc. will be handled by different agents. You do not *need* to find design issues. If there are genuinely none, that is a fine answer to report back to the user. Be honest.