'use client';

import { useState } from 'react';
import type { SyncResponse } from '@/lib/api-types';
import { readJson } from '@/lib/http';
import { skippedSyncNotice } from '@/lib/sync-messages';

// The "Sync all" action and its status line.
export function useSyncAll(refresh: () => Promise<void>) {
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  // Guards against a second concurrent POST /api/sync.
  const [syncing, setSyncing] = useState(false);
  // When "Sync all" last came back with every item clean; PlaidLinkButton uses
  // it to expire its connect-time notice. Design: link-notice-expires-on-clean-sync.
  const [syncSucceededAt, setSyncSucceededAt] = useState<number | null>(null);

  const syncAll = async () => {
    setSyncing(true);
    setSyncStatus('Syncing…');
    try {
      const res = await fetch('/api/sync', { method: 'POST' });
      const data = await readJson<SyncResponse>(res, 'Sync failed');
      const results = data.results ?? [];
      // `skipped` rows were held back (cursor not advanced) unless `dropped`,
      // in which case the sync gave up on them. Design: bounded-cursor-hold.
      const parts = results.map((result) =>
        'error' in result
          ? `${result.itemId}: ${result.error}`
          : `+${result.added} added${
              result.skipped ? `, ${skippedSyncNotice(result.skipped, result.dropped)}` : ''
            }`,
      );
      setSyncStatus(`Sync complete. ${parts.join(', ') || 'No items.'}`);
      // Clean means every item finished with no error and no held/dropped rows.
      if (results.length > 0 && results.every((result) => !('error' in result) && !result.skipped))
        setSyncSucceededAt(Date.now());
      void refresh();
    } catch (err) {
      setSyncStatus(`Sync failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      // Released when the POST settles; the refresh above is not awaited.
      setSyncing(false);
    }
  };

  return { syncAll, syncing, syncStatus, syncSucceededAt };
}
