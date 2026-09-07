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

Create a date/time specified audit folder in `.claude/audit` (meaning if /audit was called at September 7th, 2026 at 1:02pm, you are going to create the folder `.claude/audit/09-07-2026-130200` and record the audits' results in there).

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

For each agent, synthesize the 3 agents' findings into a `.md` report named after the requirement they were auditing.
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

After every agent has concluded and you've finalized every report, give a overview back to the user of the main takeways from the audit.