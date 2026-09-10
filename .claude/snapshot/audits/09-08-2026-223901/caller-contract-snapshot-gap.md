---
characteristics: [maintainability]
level: minor
status: new
first-seen: 09-08-2026-223901
locations:
  - src/app/accounts/[accountId]/category-write-state.ts:9
  - src/hooks/useLoadProtocol.ts:40
---

# SNAPSHOT documents only one of the two unenforced "caller contract" patterns

The codebase has exactly two sites using the "Caller contract: …" idiom to
document a multi-step protocol that callers must follow but nothing enforces
at compile- or runtime (`grep -rn "Caller contract:" src` returns only
these). SNAPSHOT explicitly names one — `useLoadProtocol`'s memoized-`perform`
contract, "documented, not enforced — the one contract lint can't reach" —
but not the structurally identical second case: `CategoryWriteState`'s
burst-coalescing protocol (`joinBurst` → `recordCommit` → `settleIfDone`, and
`fetchedRowMerger()` → `releaseSettledHolds()` in order), whose own comment
warns "otherwise a settled burst's hold is never released."

Why it matters (analysability): SNAPSHOT is the authoritative map of where
fragile, lint-unreachable invariants live. Because it enumerates only one
instance — phrased as "the one" — a maintainer assessing blast radius before
adding a second caller to `CategoryWriteState` gets no signal that this risk
class recurs or where. Today each contract method is called from exactly one
site and honored correctly (verified by multiple auditors), but that
containment isn't documented as a property to preserve.

Suggested direction: at the next `/snapshot`, fold `CategoryWriteState`'s
contract into the same SNAPSHOT bullet that calls out `useLoadProtocol`
(naming both instances), or generalize the wording so it no longer reads as
an exhaustive, singular callout. No code change needed — this is a
documentation-completeness gap.
