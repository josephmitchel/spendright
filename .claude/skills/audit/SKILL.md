---
name: audit
description: audit the codebase
---

Audit the codebase by calling the appropriate subagents and then synthesizing their findings into reports. 

## What will be audited
Each agent being sent out will either be auditing a quality requirement from the "ISO ISO/IEC 25010:2023":

Specifically, there will be subagents called to assess:
- Functional Suitability (ISO/IEC 25010:2023 3.1)
- Performance Efficiency (ISO/IEC 25010:2023 3.2)
- Compatibility (ISO/IEC 25010:2023 3.3)
- Interaction Capability (ISO/IEC 25010:2023 3.4)
- Reliability (ISO/IEC 25010:2023 3.5)
- Security (ISO/IEC 25010:2023 3.6)
- Maintainability (ISO/IEC 25010:2023 3.7)
- Flexibility (ISO/IEC 25010:2023 3.8)
- Safety (ISO/IEC 25010:2023 3.9)

The entire purpose of the audit is to ensure the codebase is following a set of human designed standards so that diferent agents aren't constantly making their own judgement calls about what a "correct" codebase should look like (trying to avoid too many cooks in the kitchen).

## Instructions

### Step 1

Create a date/time specified audit folder in `.claude/audit` (meaning if /audit was called at September 7th, 2026 at 1:02pm, you are going to create the folder `.claude/audit/09-07-2026-130200` and record the audits' results in there).

### Step 2

For each of the following agents defined in `.claude/agents`, spin up 4 agents:
- auditor-functional-suitability
- auditor-performance-efficiency
- auditor-compatibility
- auditor-interaction-capability
- auditor-reliability
- auditor-security
- auditor-maintainability
- auditor-flexibility
- auditor-safety

For each agent, synthesize the 4 agents' findings into a `.md` report named after the requirement they were auditing.
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

The agents label each of their findings as **prior** (a concern from a previous audit that remains unaddressed) or **new** (found in this audit). Preserve these labels when synthesizing: prefix every concern in the report with `[prior]` or `[new]`.

### Step 3

Create a file in the same audit folder titled `SUMMARY.md` which contains 2 things:
- A brief overview of the main takeaways from the audit. Use the `[prior]`/`[new]` labels here: call out which prior concerns are still lingering unaddressed versus what this audit newly surfaced.
- A score of the audit

The score of the audit is calculated this way:
- Major concern = 5
- Moderate concern = 2
- Minor concern = 1

Add up all of the concerns together and that's the score. Alongside the total, report the prior/new split (e.g. `Score: 23 (prior: 15, new: 8)`) — a shrinking prior subtotal across audits means old concerns are actually getting resolved.