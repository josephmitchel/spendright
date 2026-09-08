// Dependency-free — bundled into client code.

export const MAX_SKIPPED_SYNCS = 5;

export const ACCOUNT_REFRESH_FAILED_MESSAGE =
  'The account refresh failed on the last sync — balances may be stale (check the server ' +
  'log). Transactions still synced.';

export const ACCOUNT_REFRESH_SYNC_NOTICE =
  'account refresh failed — balances may be stale (see the server log)';

export function skippedItemErrorMessage(
  skipped: number,
  consecutiveSkippedSyncs: number,
  dropped: boolean,
): string {
  return dropped
    ? `${skipped} transaction(s) arrived for accounts that are not stored, for the ` +
        `${MAX_SKIPPED_SYNCS}th consecutive sync. They have been dropped so this connection ` +
        'keeps syncing, and they cannot be recovered — check the server log for the accounts ' +
        'involved.'
    : `${skipped} transaction(s) arrived for accounts that are not stored — they are being ` +
        `held and re-offered on every sync (${consecutiveSkippedSyncs} of ${MAX_SKIPPED_SYNCS}). ` +
        'If this line does not clear, the account cannot be stored: check the server log. ' +
        `On the ${MAX_SKIPPED_SYNCS}th consecutive sync they are dropped so the connection ` +
        'keeps working.';
}

export function skippedSyncNotice(skipped: number, dropped: boolean): string {
  return dropped
    ? `${skipped} transaction(s) dropped after repeated failures — not recoverable ` +
        '(see the server log)'
    : `${skipped} transaction(s) held for accounts that are not stored yet — they will be ` +
        'retried on the next sync (see the server log)';
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
