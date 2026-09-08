import { eq, inArray, sql } from 'drizzle-orm';
import { items, transactions } from '@/db/schema';
import { refreshItemAccounts } from '@/lib/accounts';
import { serializeByKey } from '@/lib/async-coordination';
import { decrypt } from '@/lib/crypto';
import { db } from '@/lib/db';
import { globalSingleton } from '@/lib/global-singleton';
import { logError, logWarn } from '@/lib/log';
import { getAccounts, syncTransactions } from '@/lib/plaid';
import type { ProviderAccount } from '@/lib/provider-types';
import { resolveCarriedSelections } from '@/lib/sync-carry';
import { withItemSyncLock } from '@/lib/sync-lock';
import { skippedSyncLogLine } from '@/lib/sync-messages';
import { recordSyncOutcome } from '@/lib/sync-outcome';
import { knownAccountIdsFor, upsertTransactions } from '@/lib/sync-persist';

export interface SyncItemResult {
  itemId: string;
  added: number;
  modified: number;
  removed: number;
  // Rows for accounts not in the database.
  skipped: number;
  // True when the skipped rows were dropped (cursor advanced) rather than held.
  dropped: boolean;
}

export interface SyncItemOptions {
  // The caller already fetched AND stored the item's accounts.
  accountsAlreadyStored?: boolean;
  notReadyRetries?: number;
}

// Concurrent syncItem calls on one item would race the cursor write.
const syncItemTails = globalSingleton('syncItemTails', () => new Map<string, Promise<void>>());

export function syncItem(itemId: string, options?: SyncItemOptions): Promise<SyncItemResult> {
  return serializeByKey(syncItemTails, itemId, () =>
    withItemSyncLock(itemId, () => runSyncItem(itemId, options)),
  );
}

async function runSyncItem(itemId: string, options?: SyncItemOptions): Promise<SyncItemResult> {
  // The caller's row may be stale; read cursor and token under the lock.
  const [item] = await db.select().from(items).where(eq(items.itemId, itemId));
  if (!item) throw new Error(`sync ${itemId}: item row not found`);
  const accessToken = decrypt(item.accessToken);
  // Plaid calls stay outside the DB transaction.
  let accountRefreshFailed = false;
  if (!options?.accountsAlreadyStored) {
    let plaidAccounts: ProviderAccount[] = [];
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
      // A failed upsert of an existing row leaves its balances silently stale,
      // so store failures count as a failed refresh.
      const storeFailures = await refreshItemAccounts(item.itemId, plaidAccounts);
      if (storeFailures.length > 0) accountRefreshFailed = true;
    }
  }

  const { added, modified, removed, cursor } = await syncTransactions(accessToken, item.cursor, {
    notReadyRetries: options?.notReadyRetries,
  });

  const { skipped, outcome } = await db.transaction(async (tx) => {
    // Bounds the row locks below, like the category PATCH path.
    await tx.execute(sql`set local lock_timeout = '10s'`);
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

    const removedIds = removed.map((r) => r.transactionId).filter((id) => Boolean(id));
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
