---
name: design-corpus-compaction
description: The design corpus is kept compact by policy — a new decision extends an existing record's area by default (new files only for genuinely new areas), records may hold several related dated decisions, and /compact-design re-consolidates the corpus when it fragments again
tags: [".claude/design/current", ".claude/skills/compact-design", "record growth policy", "corpus consolidation"]
date: 2026-09-07
---

Decided by the user 2026-09-07, after successive maintainability audits flagged the corpus outgrowing the source tree (93 records vs ~82 files at the 09-07 audits) as a compounding analysability trend. This supersedes the earlier "no cap or pruning policy for now" acceptance recorded under the structural risk acceptances ([[accepted-audit-risks]]).

Three rules:

- **Extend, don't add.** When a new confirmed decision falls within an existing record's area, it is recorded as a dated update or section in that record (the way the 429-retry update extended [[transient-plaid-retry]]), not as a new file. A new file is for a genuinely new area no record covers.
- **Multi-decision records are the norm, not an exception.** A record may hold several related confirmed decisions as dated sections. Each decision keeps its own date, rationale, revisit trigger, and any "do not re-flag" clause — consolidation is packaging, never summarization; the detail is what stops audits re-litigating settled decisions.
- **Re-consolidate with `/compact-design`.** When the corpus fragments again (many small sibling records accumulating around one rule or flow), the rerunnable skill at `.claude/skills/compact-design/` merges clusters losslessly, rewrites every wiki-style link and `Design:` reference, and verifies with the repo's check scripts. First run 2026-09-07: 93 records → 62.

Audits should treat the records-to-files ratio as governed by this policy: flag it only if the corpus fragments materially (many new single-decision files in areas existing records already cover) without a compaction run.
