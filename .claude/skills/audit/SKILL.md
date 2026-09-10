---
name: audit
description: audit the codebase
---

Audit the codebase by calling the appropriate subagents and then synthesizing their findings into per-concern records.

## Ground truth

`.claude/snapshot/SNAPSHOT.md` is the authoritative definition of what this codebase is **supposed** to be — what's intended, and what's intentionally absent/deferred. Auditors judge the codebase against it rather than making their own judgment calls about what a "correct" codebase should look like (avoiding too many cooks in the kitchen). If SNAPSHOT.md does not exist, **stop** and tell the user to run `/snapshot` first.

## The concern lifecycle

Every concern is one `.md` file that lives through the era under a stable slug. `/audit` is the **sole author** of concern state — `/audit-fix` implements fixes but never edits concern files.

1. An audit finds a concern → writes its file with `status: new`.
2. The next audit re-verifies **every** open concern from the most recent audit folder first: still an issue → carried into the new folder with `status: prior`; addressed → carried into the new folder **once** with `status: resolved`, then omitted from all later audits (git history keeps the ledger). Files already `status: resolved` in the previous folder are not carried again.
3. If a resolved issue regresses, it reopens under the same slug with its original `first-seen`.
4. Only after re-verification does the audit hunt for new concerns.

## Concern file format

One file per underlying issue, flat in the audit folder, named by a short kebab-case slug (e.g. `dead-pool-config-export.md`). Prior/resolved concerns reuse the previous audit's slug and carry `first-seen` forward; new concerns get `first-seen` = the current audit folder's timestamp.

```markdown
---
characteristics: [security, reliability]
level: major # major | moderate | minor
status: new # new | prior | resolved
first-seen: 09-08-2026-153000 # audit folder timestamp where it first appeared
locations:
  - src/lib/foo.ts:42
---

# <Concern title>

What the concern is, why it matters, and the suggested direction.
(For status: resolved, a line on how it was verified fixed.)
```

`characteristics` is a list: when the same underlying issue is flagged under multiple requirements, it gets **one file** listing all of them, not one file per requirement.

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

Create a date/time specified audit folder in `.claude/snapshot/audits` (meaning if /audit was called September 7th, 2026 at 1:02pm, create `.claude/snapshot/audits/09-07-2026-130200` and record the audit's results there). Audits in this folder all belong to the current snapshot's era — accepting a new snapshot clears the folder, so if it's empty before this run, this is the first audit of the era and every concern will be `status: new`.

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

Remind each agent in its prompt to read `.claude/snapshot/SNAPSHOT.md` before auditing. The agents re-verify the previous audit's concern files for their requirement (reporting each as still-open or fixed) and then audit fresh, labeling their own findings prior or new.

### Step 3

Synthesize all agents' findings into concern files in the new audit folder, per the lifecycle and format above:

- **Dedupe across characteristics**: findings from different auditors that describe the same underlying issue become one file whose `characteristics` lists every requirement that flagged it. Pick the highest level any auditor assigned.
- **Carry forward**: every open concern from the previous audit folder appears in the new one, `status: prior` (still an issue) or `status: resolved` (verified fixed), same slug, `first-seen` untouched.
- **New concerns**: fresh slug, `status: new`, `first-seen` = this folder's timestamp.

### Step 4

Create a file in the same audit folder titled `SUMMARY.md` which contains 2 things:

- A brief overview of the main takeaways: which prior concerns are still lingering unaddressed, what was newly surfaced, and what got resolved since the last audit.
- A score of the audit

The score counts each **open** concern file once (regardless of how many characteristics it lists):

- Major concern = 5
- Moderate concern = 2
- Minor concern = 1
- `status: resolved` files = 0

Add up all of the open concerns together and that's the score. Alongside the total, report the prior/new split and the resolved count (e.g. `Score: 23 (prior: 15, new: 8) — resolved this audit: 4`) — a shrinking prior subtotal across audits means old concerns are actually getting resolved.
