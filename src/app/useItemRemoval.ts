'use client';

import { useAsyncAction } from '@/hooks/useAsyncAction';
import { apiPaths } from '@/lib/api-paths';
import type { ItemDeleteResponse } from '@/lib/api-types';
import { sendJson } from '@/lib/http';

export function useItemRemoval(refresh: () => Promise<unknown>) {
  const {
    run,
    pendingKeys: removingItems,
    error: removeError,
  } = useAsyncAction(
    async (itemId: string, institutionName: string) => {
      await sendJson<ItemDeleteResponse>(
        apiPaths.item(itemId),
        'DELETE',
        undefined,
        `Failed to remove ${institutionName}`,
      );
      void refresh();
    },
    'Failed to remove item',
    { key: (itemId) => itemId },
  );

  const removeItem = (itemId: string, institutionName: string) => {
    if (!confirm('Remove this institution and all of its accounts and transactions?')) return;
    run(itemId, institutionName);
  };

  return { removeItem, removingItems, removeError };
}
