---
characteristics: [maintainability]
level: minor
status: new
first-seen: 09-08-2026-210043
locations:
  - src/app/accounts/[accountId]/category-write-state.ts:9
  - src/app/accounts/[accountId]/useCategoryPatches.ts:73
  - src/app/accounts/[accountId]/useTransactionPage.ts:42
---

# CategoryWriteState's cross-file calling contract is unstated

`CategoryWriteState` exposes five public methods (`joinBurst`, `recordCommit`, `settleIfDone`, `fetchedRowMerger`, `releaseSettledHolds`) whose correctness depends on a specific call sequence split across two other files: `useCategoryPatches.ts` must call `joinBurst` then, after the network reply, `recordCommit`/`settleIfDone` in that order; `useTransactionPage.ts` must call `fetchedRowMerger()` then `releaseSettledHolds()` on every load, in that order, or a completed burst's hold is never released and stale-poll protection silently outlives its purpose. None of this sequencing is documented on the class or its methods — contrast with `useLoadProtocol.ts`, which states its comparably load-bearing caller contract in a comment. Under the repo's sparse-comment convention this ordering constraint is exactly the allowed exception ("a rare one-line local constraint the code cannot show"), and it's missing here. A maintainer changing either consuming hook has no local signal of the invariant they'd break, and with tests deliberately deferred nothing would catch a subtle regression. Suggested direction: add short doc comments on the public methods stating the required call order/pairing, similar to `useLoadProtocol`'s contract comment.
