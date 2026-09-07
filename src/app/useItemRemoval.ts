'use client';

import { useAsyncAction } from '@/hooks/useAsyncAction';
import { apiPaths } from '@/lib/api-paths';
import type { ItemDeleteResponse } from '@/lib/api-types';
import { sendJson } from '@/lib/http';

// Removing an institution, behind a browser confirm.
// Design: item-delete-plaid-first, shared-mutation-protocol.
export function useItemRemoval(refresh: () => Promise<void>) {
  const failure = 'Failed to remove item';
  // Keyed per item, so only a re-confirm of the same item is dropped while
  // its DELETE is in flight.
  const { run, error: removeError } = useAsyncAction(
    async (itemId: string) => {
      await sendJson<ItemDeleteResponse>(apiPaths.item(itemId), 'DELETE', undefined, failure);
      void refresh();
    },
    failure,
    { key: (itemId) => itemId },
  );

  const removeItem = (itemId: string) => {
    if (!confirm('Remove this institution and all of its accounts and transactions?')) return;
    run(itemId);
  };

  return { removeItem, removeError };
}
