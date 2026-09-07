import type { ApiTransaction } from '@/lib/api-types';
import { categoryFields, type CategoryPatch } from './category-patch';

// One row's write state. A burst is the run of overlapping PATCHes on one
// row; while an entry exists, loads may not overwrite the row's on-screen
// category fields. The hold outlives its burst by one successful load
// ('releasing'): a poll whose response was read before the burst's PATCH
// committed can settle after the burst ends.
// Design: optimistic-category-writes.
interface RowWriteState {
  burst: { pending: number; baseline: ApiTransaction; committed: ApiTransaction | null } | null;
  hold: 'held' | 'releasing';
}

// The whole per-row category-write state machine — burst counting, the
// commit/baseline reconcile, and the load holds — so the transitions live in
// one place instead of half in each hook.
// Design: optimistic-category-writes.
export class CategoryWriteState {
  private rows = new Map<string, RowWriteState>();

  // Counts a patch into the row's burst, opening one (with `row` as the
  // pre-burst baseline) if none is running.
  joinBurst(row: ApiTransaction): void {
    const state = this.rows.get(row.transactionId);
    if (state?.burst) state.burst.pending++;
    else {
      this.rows.set(row.transactionId, {
        burst: { pending: 1, baseline: row, committed: null },
        hold: 'held',
      });
    }
  }

  // In-order responses mean the latest committed row is always the newest.
  recordCommit(transactionId: string, serverRow: ApiTransaction): void {
    const burst = this.rows.get(transactionId)?.burst;
    if (burst) burst.committed = serverRow;
  }

  // Settles one patch. When it was the burst's newest, closes the burst and
  // returns the category fields to reconcile the row to (newest committed
  // response, else the pre-burst baseline); an older patch's settle just
  // decrements and returns null.
  settleIfDone(transactionId: string): Required<CategoryPatch> | null {
    const state = this.rows.get(transactionId);
    if (!state?.burst || --state.burst.pending > 0) return null;
    const settled = state.burst.committed ?? state.burst.baseline;
    state.burst = null;
    state.hold = 'releasing';
    return categoryFields(settled);
  }

  // A merger over a snapshot of the holds, pure so it can run inside a
  // setState updater: a fetched row keeps a held row's on-screen category
  // fields instead of snapping the select back.
  fetchedRowMerger(): (incoming: ApiTransaction[], shown: ApiTransaction[]) => ApiTransaction[] {
    const holds = new Set(this.rows.keys());
    return (incoming, shown) =>
      holds.size === 0
        ? incoming
        : incoming.map((txn) => {
            if (!holds.has(txn.transactionId)) return txn;
            const onScreen = shown.find((row) => row.transactionId === txn.transactionId);
            return onScreen ? { ...txn, ...categoryFields(onScreen) } : txn;
          });
  }

  // Called after a successful load applied its rows; merging the
  // already-reconciled fields for that one extra load is a no-op in every
  // non-racy case.
  releaseSettledHolds(): void {
    for (const [transactionId, state] of this.rows) {
      if (state.hold === 'releasing') this.rows.delete(transactionId);
    }
  }
}
