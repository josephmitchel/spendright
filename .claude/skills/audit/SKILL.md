---
name: audit
description: audit the codebase
---

Audit the codebase by calling the appropriate subagents and then synthesizing their findings into reports.

## Ground truth

`.claude/snapshot/SNAPSHOT.md` is the authoritative definition of what this codebase is **supposed** to be — what's intended, and what's intentionally absent/deferred. Auditors judge the codebase against it rather than making their own judgment calls about what a "correct" codebase should look like (avoiding too many cooks in the kitchen). If SNAPSHOT.md does not exist, **stop** and tell the user to run `/snapshot` first.

## What will be audited

Each agent being sent out will be auditing a quality requirement from ISO/IEC 25010:2023:

- Functional Suitability (3.1)
- Performance Efficiency (3.2)
- Compatibility (3.3)
- Interaction Capability (3.4)
- Reliability (3.5)
- Security (3.6)
- Maintainability (3.7)
- Flexibility (3.8)
- Safety (3.9)

## Instructions

### Step 1

Create a date/time specified audit folder in `.claude/snapshot/audits` (meaning if /audit was called September 7th, 2026 at 1:02pm, create `.claude/snapshot/audits/09-07-2026-130200` and record the audit's results there). Audits in this folder all belong to the current snapshot's era — accepting a new snapshot clears the folder, so if it's empty before this run, this is the first audit of the era and every finding will be `[new]`.

### Step 2

For each of the following agents defined in `.claude/agents`, spin up 3 agents:

- auditor-functional-suitability
- auditor-performance-efficiency
- auditor-compatibility
- auditor-interaction-capability
- auditor-reliability
- auditor-security
- auditor-maintainability
- auditor-flexibility
- auditor-safety

Remind each agent in its prompt to read `.claude/snapshot/SNAPSHOT.md` before auditing.

For each requirement, synthesize the 3 agents' findings into a `.md` report named after the requirement they were auditing.

- For example, the synthesized findings from the 3 auditor-functional-suitability agents would be saved as `functional-suitability.md`.

Each report should be structured as follows:

```
---
characteristic: "i.e. functional suitability"
---
# Summary

# Major Concerns

# Moderate Concerns

# Minor Concerns
```

The agents label each of their findings as **prior** (a concern from a previous audit in this era that remains unaddressed) or **new** (found in this audit). Preserve these labels when synthesizing: prefix every concern in the report with `[prior]` or `[new]`.

### Step 3

Create a file in the same audit folder titled `SUMMARY.md` which contains 2 things:

- A brief overview of the main takeaways from the audit. Use the `[prior]`/`[new]` labels here: call out which prior concerns are still lingering unaddressed versus what this audit newly surfaced.
- A score of the audit

The score of the audit is calculated this way:

- Major concern = 5
- Moderate concern = 2
- Minor concern = 1

Add up all of the concerns together and that's the score. Alongside the total, report the prior/new split (e.g. `Score: 23 (prior: 15, new: 8)`) — a shrinking prior subtotal across audits means old concerns are actually getting resolved.
