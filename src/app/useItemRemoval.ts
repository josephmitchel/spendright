'use client';

import { useAsyncAction } from '@/hooks/useAsyncAction';
import { apiPaths } from '@/lib/api-paths';
import type { ItemDeleteResponse } from '@/lib/api-types';
import { sendJson } from '@/lib/http';

// Design: item-delete-plaid-first, shared-mutation-protocol.
export function useItemRemoval(refresh: () => Promise<unknown>) {
  const failure = 'Failed to remove item';
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
