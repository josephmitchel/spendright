---
name: audit-fix
description: apply fixes to the problems found within an audit
---

When this skill is invoked, it means the user wants to fix the issues that were raised in a recent audit.

## Instructions

First, confirm with the user which audit they are selecting (it will almost always be the most recent audit so always recommend that one) and what concern level they want to address (just major, major & moderate, all, etc.).

After you know what audit it is, navigate to that audit's folder in `.claude/audit`, familiarize yourself with the findings of that audit, and then come up with a plan to address every concern in the audit from the concern level they requested. Use /deep-research for your plan, and ask the user any questions if you are unsure about what direction you should go with a change. Never assume, no stupid questions.