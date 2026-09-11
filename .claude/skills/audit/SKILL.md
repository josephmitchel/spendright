---
name: audit
description: audit the codebase
---

Audit the codebase by calling the appropriate subagents and then synthesizing their findings into per-concern records.

The codebase itself is the authoritative truth about what the project is — auditors judge the code against their requirement definitions and nothing else. There is no intent document and no suppression list; every genuine deviation from a requirement is a concern, and the prior/new tracking below is what keeps repeat flags legible across audits.

Audits are **local, per-branch working records**: they live under `.claude/audit/<branch>/`, are gitignored, and are never merged. The branch subfolder matters — gitignored files don't switch with branches, so every branch's audits share one working directory.

## The concern lifecycle

Every concern is one `.md` file that lives through the branch's audit history under a stable slug. `/audit` is the **sole author** of concern state — `/audit-fix` implements fixes but never edits concern files.

1. An audit finds a concern → writes its file with `status: new`.
2. The next audit on the same branch re-verifies **every** open concern from that branch's most recent audit folder first: still an issue → carried into the new folder with `status: prior`; addressed → carried into the new folder **once** with `status: resolved`, then omitted from all later audits.
3. If a resolved issue regresses, it reopens under the same slug with its original `first-seen`.
4. Only after re-verification does the audit hunt for new concerns.

A branch with no audit folder yet simply hasn't been audited: its first audit has no priors and every concern is `status: new`. New branches deliberately do not inherit the audits of the branch they were cut from.

## Concern file format

One file per underlying issue, named by a short kebab-case slug (e.g. `dead-pool-config-export.md`), placed in a subfolder of the audit folder named for the concern's **primary characteristic** — the first entry in its `characteristics` list, kebab-cased to match the auditor names (`security/`, `maintainability/`, `testing/`, …). Create a characteristic's subfolder only when a concern lands in it; no empty folders. `SUMMARY.md` is the only file at the audit folder's top level. Prior/resolved concerns reuse the previous audit's slug and primary characteristic (so they stay findable across runs) and carry `first-seen` forward; new concerns get `first-seen` = the current audit folder's timestamp. Audits before this layout kept concern files flat at the folder root — when re-verifying such a folder, read them from there.

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

`characteristics` is a list: when the same underlying issue is flagged under multiple requirements, it gets **one file** listing all of them, not one file per requirement — filed under the first-listed (primary) one.

## What will be audited

Each agent being sent out will be auditing a quality requirement — nine from ISO/IEC 25010:2023, plus one repo-specific requirement:

- Functional Suitability (3.1)
- Performance Efficiency (3.2)
- Compatibility (3.3)
- Interaction Capability (3.4)
- Reliability (3.5)
- Security (3.6)
- Maintainability (3.7)
- Flexibility (3.8)
- Safety (3.9)
- Testing (repo-specific: test coverage and test-suite quality)

## Instructions

### Step 1

Determine the current branch (`git branch --show-current`) and create a date/time specified audit folder at `.claude/audit/<branch>/<timestamp>` (meaning if /audit was called on branch `main` on September 7th, 2026 at 1:02pm, create `.claude/audit/main/09-07-2026-130200`; a branch name containing `/` just nests deeper). Record the audit's results there.

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
- auditor-testing

The agents re-verify the previous audit's concern files for their requirement on this branch (reporting each as still-open or fixed) and then audit fresh, labeling their own findings prior or new.

### Step 3

Synthesize all agents' findings into concern files in the new audit folder, per the lifecycle and format above:

- **Dedupe across characteristics**: findings from different auditors that describe the same underlying issue become one file whose `characteristics` lists every requirement that flagged it. Pick the highest level any auditor assigned.
- **Carry forward**: every open concern from this branch's previous audit folder (check all its subfolders; older audits were flat) appears in the new one, `status: prior` (still an issue) or `status: resolved` (verified fixed), same slug and primary characteristic, `first-seen` untouched.
- **New concerns**: fresh slug, `status: new`, `first-seen` = this folder's timestamp.
- Every file lands in its primary characteristic's subfolder per the format above; `SUMMARY.md` alone sits at the top level.

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
