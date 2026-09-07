// One item's sync flow: Plaid drain, then a single DB transaction persisting
// the batch (src/lib/sync-persist.ts, with the carry from src/lib/sync-carry.ts)
// and recording the outcome (src/lib/sync-outcome.ts).
import { inArray } from 'drizzle-orm';
import { type AccountBase } from 'plaid';
import { transactions, type ItemRow } from '@/db/schema';
import { refreshItemAccounts } from '@/lib/accounts';
import { serializeByKey } from '@/lib/async-coordination';
import { decrypt } from '@/lib/crypto';
import { db } from '@/lib/db';
import { globalSingleton } from '@/lib/global-singleton';
import { logError, logWarn } from '@/lib/log';
import { getAccounts, syncTransactions } from '@/lib/plaid';
import { resolveCarriedSelections } from '@/lib/sync-carry';
import { skippedSyncLogLine } from '@/lib/sync-messages';
import { recordSyncOutcome } from '@/lib/sync-outcome';
import { knownAccountIdsFor, upsertTransactions } from '@/lib/sync-persist';

export interface SyncItemResult {
  itemId: string;
  added: number;
  modified: number;
  removed: number;
  // Rows for accounts not in the database. Non-zero means the item did not
  // finish syncing cleanly even though nothing threw.
  skipped: number;
  // True when the skipped rows were dropped (cursor advanced) rather than held.
  dropped: boolean;
}

export interface SyncItemOptions {
  // True when the caller already fetched AND stored the item's accounts (the
  // link flow does both). Design: accounts-refreshed-per-sync.
  accountsAlreadyStored?: boolean;
  // Passed through to syncTransactions.
  notReadyRetries?: number;
}

// Per-item lock: concurrent syncItem calls on one item would race the cursor
// write. Design: scheduled-sync.
const syncItemTails = globalSingleton('syncItemTails', () => new Map<string, Promise<void>>());

export function syncItem(item: ItemRow, options?: SyncItemOptions): Promise<SyncItemResult> {
  return serializeByKey(syncItemTails, item.itemId, () => runSyncItem(item, options));
}

async function runSyncItem(item: ItemRow, options?: SyncItemOptions): Promise<SyncItemResult> {
  const accessToken = decrypt(item.accessToken);
  // Plaid calls stay outside the DB transaction. The account refresh is
  // best-effort: on failure the sync proceeds against stored accounts.
  // Design: accounts-refreshed-per-sync
  let accountRefreshFailed = false;
  if (!options?.accountsAlreadyStored) {
    let plaidAccounts: AccountBase[] = [];
    try {
      plaidAccounts = await getAccounts(accessToken);
    } catch (err) {
      accountRefreshFailed = true;
      logError(
        `sync ${item.itemId}: accountsGet failed — syncing without an account refresh:`,
        err,
      );
    }
    if (plaidAccounts.length > 0) {
      // A failed upsert of an EXISTING row leaves its balances silently
      // stale (the known-account guard only covers absent rows), so store
      // failures count as a failed refresh.
      const storeFailures = await refreshItemAccounts(item.itemId, plaidAccounts);
      if (storeFailures.length > 0) accountRefreshFailed = true;
    }
  }

  const { added, modified, removed, cursor } = await syncTransactions(accessToken, item.cursor, {
    notReadyRetries: options?.notReadyRetries,
  });

  const { skipped, outcome } = await db.transaction(async (tx) => {
    const upserts = [...added, ...modified];
    const knownAccountIds = await knownAccountIdsFor(tx, upserts);
    // The carry must resolve before the pending rows are deleted below.
    const carried = await resolveCarriedSelections(tx, added);
    const skippedCount = await upsertTransactions(
      tx,
      item.itemId,
      upserts,
      knownAccountIds,
      carried,
    );

    const removedIds = removed
      .map((r) => r.transaction_id)
      .filter((id): id is string => Boolean(id));
    if (removedIds.length > 0) {
      await tx.delete(transactions).where(inArray(transactions.transactionId, removedIds));
    }

    return {
      skipped: skippedCount,
      outcome: await recordSyncOutcome(tx, item.itemId, skippedCount, cursor, accountRefreshFailed),
    };
  });

  if (skipped > 0) {
    const line = skippedSyncLogLine(
      item.itemId,
      skipped,
      outcome.consecutiveSkippedSyncs,
      outcome.dropped,
    );
    if (outcome.dropped) logError(line);
    else logWarn(line);
  }

  return {
    itemId: item.itemId,
    added: added.length,
    modified: modified.length,
    removed: removed.length,
    skipped,
    dropped: outcome.dropped,
  };
}
