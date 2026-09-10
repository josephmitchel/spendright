# Audit Summary — 09-08-2026-222047

Fourth audit of the current snapshot era. 27 auditors ran (3 per ISO/IEC 25010:2023 requirement; one flexibility auditor's report was lost after completion, leaving flexibility covered by 2 clean reports), re-verifying the 2 open concerns from `09-08-2026-214636` before hunting fresh.

## Main takeaways

**Both prior concerns were verified resolved**, each by its owning requirement's three auditors independently and spot-checked at synthesis:

- `category-irreversibility-warning-hover-only` (minor) — a permanently visible warning line now renders above the transaction table (`TransactionTable.tsx:114`), reaching touch and keyboard users, with the `title` cue retained as a supplement.
- `sequential-independent-reads-in-carry-lock-transaction` (minor) — both sites now use `Promise.all` (`sync-carry.ts:57`, `sync.ts:82`). One auditor verified against the pinned `pg` driver that same-transaction `Promise.all` doesn't actually pipeline in node-postgres, so the win was cosmetic — the caveat is recorded in the concern file so future audits neither re-flag nor re-credit this shape.

**Newly surfaced: 2 concerns.**

- `focus-loss-on-disabled-controls` (moderate, interaction-capability) — every pending/stale state disables a native control in place, which ejects keyboard focus to `<body>` with no restoration anywhere except the one item-removal case; the category select can even lose focus from a background poll the user didn't initiate. First moderate finding in two audits.
- `react-plaid-link-unpinned` (minor, compatibility) — the last caret-ranged runtime dependency, sitting exactly on the Plaid Link interop path; flagged by one compatibility auditor with a recorded dissent from another, kept as minor because the project's exact-pin posture is otherwise universal.

Otherwise this audit continued the era's clean streak: functional suitability, performance efficiency, reliability, security, maintainability, flexibility, and safety all returned zero open findings across their auditors, repeatedly noting the implementation matches SNAPSHOT.md line-for-line. Typecheck, lint, and prettier run clean; `npm audit --omit=dev` reports zero vulnerabilities; no file approaches the 400-line cap; all `Verified-on:` markers match the pinned versions exactly.

(Noted for the next `/snapshot`, not findings per standing guidance on untracked files: the working tree carries an uncommitted `drizzle/0009_backfill_reward_rate.sql` migration beyond SNAPSHOT's "Nine migrations, 0000–0008", and an uncommitted correction to the setup-failure vs. sync-failure link messaging.)

## Score

Score: 3 (prior: 0, new: 3) — resolved this audit: 2

| Level     | Count      | Points |
| --------- | ---------- | ------ |
| Major     | 0          | 0      |
| Moderate  | 1          | 2      |
| Minor     | 1          | 1      |
| **Total** | **2 open** | **3**  |

The prior subtotal has now been 0 for three audits running — every carried concern keeps getting resolved within one cycle. The open set remains small pattern-residue: one focus-management gap the accessibility fixes didn't sweep to, and one dependency the pinning fix didn't sweep to.
