// The bounded cursor hold's budget and user-facing wording, in one place so
// the policy cannot drift between the stored item error and the client
// notices. Dependency-free — bundled into client code.
// Design: bounded-cursor-hold.

// Consecutive syncs a cursor may be held back before the skipped rows are
// dropped.
export const MAX_SKIPPED_SYNCS = 5;

// Stored on items.error while rows are held, or after they are dropped.
// { message } is the non-Plaid shape of items.error.
export function skippedItemErrorMessage(
  skipped: number,
  consecutiveSkippedSyncs: number,
  dropped: boolean,
): string {
  return dropped
    ? `${skipped} transaction(s) arrived for accounts that are not stored, for the ${MAX_SKIPPED_SYNCS}th consecutive sync. They have been dropped so this connection keeps syncing, and they cannot be recovered — check the server log for the accounts involved.`
    : `${skipped} transaction(s) arrived for accounts that are not stored — they are being held and re-offered on every sync (${consecutiveSkippedSyncs} of ${MAX_SKIPPED_SYNCS}). If this line does not clear, the account cannot be stored: check the server log. On the ${MAX_SKIPPED_SYNCS}th consecutive sync they are dropped so the connection keeps working.`;
}

// Short client-side summary, shared by the sync-all status line and the
// connect-time notice.
export function skippedSyncNotice(skipped: number, dropped: boolean): string {
  return dropped
    ? `${skipped} transaction(s) dropped after repeated failures — not recoverable (see the server log)`
    : `${skipped} transaction(s) held for accounts that are not stored yet — they will be retried on the next sync (see the server log)`;
}
