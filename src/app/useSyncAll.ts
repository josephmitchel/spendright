'use client';

import { useState } from 'react';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { apiPaths } from '@/lib/api-paths';
import type { SyncResponse } from '@/lib/api-types';
import { sendJson } from '@/lib/http';
import { isSyncFailure } from '@/lib/sync-failure';
import { skippedSyncNotice } from '@/lib/sync-messages';

// The "Sync all" action, its status line, and its failure.
// Design: shared-mutation-protocol.
export function useSyncAll(refresh: () => Promise<void>) {
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  // When "Sync all" last came back with every item clean.
  // Design: link-notice-expires-on-clean-sync.
  const [syncSucceededAt, setSyncSucceededAt] = useState<number | null>(null);

  const {
    run: syncAll,
    pending: syncing,
    error: syncError,
  } = useAsyncAction(async () => {
    setSyncStatus('Syncing…');
    try {
      const data = await sendJson<SyncResponse>(apiPaths.sync, 'POST', undefined, 'Sync failed');
      const results = data.results;
      // `skipped` rows were held back (cursor not advanced) unless `dropped`.
      // Design: bounded-cursor-hold.
      const parts = results.map((result) =>
        isSyncFailure(result)
          ? `${result.itemId}: ${result.error}`
          : `+${result.added} added${
              result.skipped ? `, ${skippedSyncNotice(result.skipped, result.dropped)}` : ''
            }`,
      );
      setSyncStatus(`Sync complete. ${parts.join(', ') || 'No items.'}`);
      // Clean means every item finished with no error and no held/dropped rows.
      if (
        results.length > 0 &&
        results.every((result) => !isSyncFailure(result) && !result.skipped)
      )
        setSyncSucceededAt(Date.now());
      void refresh();
    } catch (err) {
      // The status line must not read "Syncing…" beside the failure.
      setSyncStatus(null);
      throw err;
    }
  }, 'Sync failed');

  return { syncAll, syncing, syncStatus, syncError, syncSucceededAt };
}
