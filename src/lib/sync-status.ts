import { globalSingleton } from '@/lib/global-singleton';

export type SyncTrigger = 'scheduled' | 'manual';

// In-memory is correct here: the scheduler runs in this process, and a
// whole-run failure has no item row to carry it.
export interface LastSyncStatus {
  finishedAt: number;
  // Null when the run itself completed; per-item failures live on items.error.
  error: string | null;
  // A single-flight joiner inherits the initiator's trigger.
  trigger: SyncTrigger;
}

const slot = globalSingleton('syncStatus', () => ({
  last: null as LastSyncStatus | null,
}));

export function recordLastSync(error: string | null, trigger: SyncTrigger): void {
  slot.last = { finishedAt: Date.now(), error, trigger };
}

export function lastSyncStatus(): LastSyncStatus | null {
  return slot.last;
}
