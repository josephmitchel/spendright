import type { ApiTransaction } from '@/lib/api-types';
import { categoryFields, type CategoryPatch } from './category-patch';

interface RowWriteState {
  burst: { pending: number; baseline: ApiTransaction; committed: ApiTransaction | null } | null;
  hold: 'held' | 'releasing';
}

// Caller contract: each PATCH calls joinBurst before sending, then
// recordCommit (success only) followed by settleIfDone after the reply; every
// fetch calls fetchedRowMerger() then releaseSettledHolds(), in that order —
// otherwise a settled burst's hold is never released.
export class CategoryWriteState {
  private rows = new Map<string, RowWriteState>();

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

  recordCommit(transactionId: string, serverRow: ApiTransaction): void {
    const burst = this.rows.get(transactionId)?.burst;
    if (burst) burst.committed = serverRow;
  }

  settleIfDone(transactionId: string): Required<CategoryPatch> | null {
    const state = this.rows.get(transactionId);
    if (!state?.burst || --state.burst.pending > 0) return null;
    const settled = state.burst.committed ?? state.burst.baseline;
    state.burst = null;
    state.hold = 'releasing';
    return categoryFields(settled);
  }

  // Pure so it can run inside a setState updater.
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

  releaseSettledHolds(): void {
    for (const [transactionId, state] of this.rows) {
      if (state.hold === 'releasing') this.rows.delete(transactionId);
    }
  }
}
