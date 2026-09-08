---
name: compact-design
description: Losslessly consolidate the design-record corpus in .claude/design/current when it has grown too fragmented — merge clusters of related records into single multi-decision records, rewrite every reference, and verify with the repo's own check scripts
---

Consolidate the design-record corpus in `.claude/design/current/`. This skill exists because the corpus grows one file per decision by default, and periodically the file count outgrows retrieval usefulness (the maintainability audits track the records-to-source-files ratio). Consolidation is **lossless**: decisions are merged as dated sections into fewer files — rationale, revisit triggers, and "do not re-flag" clauses are never summarized away, because they are exactly what stops future audits from re-litigating settled decisions.

The governing policy is `.claude/design/current/design-corpus-compaction.md`. Read it first.

## What counts as a mergeable cluster

Merge records only when they are facets of one rule or one code area a reader would want together:

- Several small records stating instances of the same general rule (e.g. per-endpoint ordering rules under one "list endpoints are ordered" record).
- A family of decisions about one flow or module (e.g. the link/onboarding flow's failure-handling decisions).
- Companion records that cite each other as siblings and share a revisit trigger (e.g. paired deferrals).
- "Accepted risk / do-not-re-flag" records of the same kind.

Do NOT merge records that merely touch the same file but state unrelated rules, and do not merge into grab-bags so broad the name stops predicting the content. A large, load-bearing standalone record (e.g. a security posture record) stays standalone. When in doubt, leave it separate — a wrong merge costs more than a spare file.

## Procedure

### Step 1 — Survey

Read every record in `.claude/design/current/` in full. Build the cluster plan: for each cluster pick a **survivor name** (the record whose name best covers the merged scope — reusing an existing name minimizes reference churn) or, when none covers it, a new umbrella name. Record the full mapping `old-name → target-name` for every folded record.

### Step 2 — Confirm scope

Present the cluster plan (mapping + expected file-count change) to the user before executing, unless the user already approved the run's scope. Merging never changes what was decided, but the packaging is itself recorded design structure.

### Step 3 — Compose merged records

For each target:

- Frontmatter: `name` = target name; `description` = one line covering the merged scope; `tags` = union of the constituents' tags, deduplicated; `date` = the earliest constituent's date.
- Body: the survivor's body first (under a heading if helpful), then each folded record's body as its own `## <topic>` section. Keep bodies essentially verbatim; where a date lived only in the old frontmatter, add "(decided <date>)" to its section. Preserve every rationale, revisit trigger, and audit-suppression clause.
- Rewrite `[[links]]` inside the composed body through the mapping; a link to a now-internal sibling becomes plain prose ("below" / the section name).

### Step 4 — Delete folded files, rewrite references

- Delete each folded record file (the survivor path is overwritten in place).
- Apply the mapping everywhere else:
  - `[[old-name]]` → `[[target-name]]` in every remaining record in `current/` AND `retired/`.
  - `Design: old-name` → `Design: target-name` in `src/`, `scripts/`, and the root config files (`next.config.ts`, `eslint.config.mjs`, `drizzle.config.ts`, etc. — the same set `scripts/lib/source-files.mjs` walks).
- Do not touch historical audit reports under `.claude/audit/` — they cite record names as they stood at audit time.

### Step 5 — Verify

Run and require all clean:

```
node scripts/check-design-refs.mjs
node scripts/check-record-tags.mjs
node scripts/check-verified-claims.mjs
npm run lint
```

Also grep for leftovers: every old name must have zero `[[old-name]]` and `Design: old-name` occurrences outside `.claude/audit/`.

### Step 6 — Report

Report the mapping (old → new), the file-count change, and the check results. If any decision looked stale or contradictory during the survey, list it for the user rather than silently dropping or "fixing" it — content changes are out of scope for this skill.
