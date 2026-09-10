---
characteristics: [maintainability]
level: minor
status: resolved
first-seen: 09-08-2026-223901
locations:
  - src/app/accounts/[accountId]/category-write-state.ts:9
  - src/hooks/useLoadProtocol.ts:40
---

# SNAPSHOT documents only one of the two unenforced "caller contract" patterns

The codebase has exactly two sites using the "Caller contract: …" idiom to
document a multi-step protocol that callers must follow but nothing enforces.
SNAPSHOT named only `useLoadProtocol`'s memoized-`perform` contract, not the
structurally identical `CategoryWriteState` burst-coalescing protocol.

**Verified fixed** by all three maintainability auditors: SNAPSHOT's
Architecture "Lint" bullet now reads "Two 'Caller contract' protocols are
documented, not enforced" and names both — `useLoadProtocol`'s
memoized-`perform` requirement and `CategoryWriteState`'s burst-coalescing
call order (`joinBurst` → `recordCommit` → `settleIfDone`;
`fetchedRowMerger()` before `releaseSettledHolds()`) — with guidance to keep
the single-caller containment when adding callers. `grep -rn "Caller
contract:" src` still returns exactly those two sites, both accurately
described.
