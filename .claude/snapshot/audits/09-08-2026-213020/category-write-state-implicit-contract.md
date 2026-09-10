---
characteristics: [maintainability]
level: minor
status: resolved
first-seen: 09-08-2026-210043
locations:
  - src/app/accounts/[accountId]/category-write-state.ts:9
---

# CategoryWriteState's cross-file calling contract is unstated

`CategoryWriteState`'s five public methods depended on a specific call sequence split across `useCategoryPatches.ts` and `useTransactionPage.ts`, with no local documentation of the ordering invariant — the allowed comment-policy exception that `useLoadProtocol.ts` already used.

Verified fixed by all three maintainability auditors: `src/app/accounts/[accountId]/category-write-state.ts:9-12` now carries a doc comment stating the exact caller contract (joinBurst before sending; recordCommit then settleIfDone after the reply; fetchedRowMerger() then releaseSettledHolds() on every fetch, in that order, else a settled burst's hold is never released). Both consuming hooks were re-checked and still honor the documented order.
