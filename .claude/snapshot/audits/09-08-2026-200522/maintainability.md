---
characteristic: 'maintainability'
---

# Summary

All three prior-era concerns (Prettier formatting drift, unused exports, duplicated chunk-size constant) remain resolved — verified by re-running the full toolchain: `tsc --noEmit`, `eslint`, `prettier --check`, `knip` (zero unused exports/files), `madge --circular` (0 cycles), and `jscpd` (only one trivial schema-DSL clone) all pass clean. Fresh checks also confirmed: largest file 320 lines (well under the 400-line ESLint ceiling), all 14 `Verified-on:` markers matching installed package versions exactly, the `useLoadProtocol` memoized-`perform` contract honored at all three call sites, the closed `SingletonKey` union free of drift, the client/server boundary intact, migration count matching the snapshot, the merge-gate hook live, and zero TODO/FIXME markers.

One auditor raised a new Minor concern about the comment policy drifting from SNAPSHOT.md's description (below). Two auditors also noted a transient `format:check` failure caused by this audit's own in-flight report files being written concurrently — explicitly not a finding (the audit reports are formatted with Prettier at the end of the run).

# Major Concerns

None.

# Moderate Concerns

None.

# Minor Concerns

- `[new]` **Comment volume and content deviate from SNAPSHOT.md's declared comment policy.** SNAPSHOT.md's "Comment policy" claims "near-zero comments, default zero on new code," allowing only `Verified-on:` markers or a rare one-line local constraint — but `src/` carries ~229 non-`Verified-on` comment lines (~5% of source lines), several of which are multi-point module-level rationale (e.g. `src/lib/pool-config.ts:1-7`, `src/lib/money.ts:1-6`). The comments themselves aid analysability; the issue is that the authoritative snapshot inaccurately describes the actual convention, which could mislead future maintainers about what's expected or how much to trust other snapshot claims. Reconcile at the next `/snapshot` run by tightening practice or updating the policy language.
