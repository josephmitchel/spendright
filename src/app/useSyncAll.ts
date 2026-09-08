'use client';

import { useState } from 'react';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { apiPaths } from '@/lib/api-paths';
import type { SyncResponse } from '@/lib/api-types';
import { sendJson } from '@/lib/http';
import { isSyncFailure } from '@/lib/sync-failure';
import { skippedSyncNotice } from '@/lib/sync-messages';

export function useSyncAll(refresh: () => Promise<unknown>) {
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
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
      const parts = results.map((result) =>
        isSyncFailure(result)
          ? `${result.institutionName ?? result.itemId}: ${result.error}`
          : `+${result.added} added${
              result.skipped ? `, ${skippedSyncNotice(result.skipped, result.dropped)}` : ''
            }`,
      );
      setSyncStatus(`Sync complete. ${parts.join(', ') || 'No items.'}`);
      if (
        results.length > 0 &&
        results.every((result) => !isSyncFailure(result) && !result.skipped)
      )
        setSyncSucceededAt(Date.now());
      void refresh();
    } catch (err) {
      setSyncStatus(null);
      throw err;
    }
  }, 'Sync failed');

  return { syncAll, syncing, syncStatus, syncError, syncSucceededAt };
}
