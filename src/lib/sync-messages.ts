// Dependency-free — bundled into client code.
// Notice copy leads with what happened and what the user can do in the app;
// operator detail lives in the server log lines below, not in these strings.

export const MAX_SKIPPED_SYNCS = 5;

export const ACCOUNT_REFRESH_FAILED_MESSAGE =
  'Balances may be out of date — the account refresh failed on the last sync. Transactions ' +
  'still synced; balances usually recover on the next sync.';

export const ACCOUNT_REFRESH_SYNC_NOTICE =
  'balances may be out of date (the account refresh failed) — they usually recover on the ' +
  'next sync';

export const INCOMPLETE_SYNC_NOTICE =
  'there were more transactions than one sync pulls — sync again to fetch the rest';

export function skippedItemErrorMessage(
  skipped: number,
  consecutiveSkippedSyncs: number,
  dropped: boolean,
): string {
  return dropped
    ? `${skipped} transaction(s) belonged to an account SpendRight could not store and were ` +
        `dropped after ${MAX_SKIPPED_SYNCS} consecutive syncs so this connection keeps ` +
        'working. They cannot be recovered.'
    : `${skipped} transaction(s) belong to an account SpendRight has not stored — they are ` +
        `held and retried on every sync (${consecutiveSkippedSyncs} of ${MAX_SKIPPED_SYNCS} ` +
        'before they are dropped). If this notice keeps coming back, remove this institution ' +
        'and connect it again.';
}

export function skippedSyncNotice(skipped: number, dropped: boolean): string {
  return dropped
    ? `${skipped} transaction(s) dropped after repeated retries — they cannot be recovered`
    : `${skipped} transaction(s) held for an account that is not stored yet — they will be ` +
        'retried on the next sync';
}

export function skippedSyncLogLine(
  itemId: string,
  skipped: number,
  consecutiveSkippedSyncs: number,
  dropped: boolean,
): string {
  return dropped
    ? `sync ${itemId}: ${skipped} transaction(s) reference accounts that are not stored — ` +
        `held back for ${MAX_SKIPPED_SYNCS - 1} syncs and now DROPPED, cursor advanced; ` +
        'these rows are gone (see the per-row lines above for the accounts)'
    : `sync ${itemId}: ${skipped} transaction(s) reference accounts that are not stored — ` +
        'cursor held back, this batch will be re-offered on the next sync ' +
        `(${MAX_SKIPPED_SYNCS - consecutiveSkippedSyncs} more before it is dropped)`;
}
