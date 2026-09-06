'use client';

import { useState } from 'react';
import type { ItemDeleteResponse } from '@/lib/api-types';
import { errorMessage, sendJson } from '@/lib/http';

// Removing an institution (and, by cascade, its accounts and transactions),
// behind a browser confirm. Design: item-delete-plaid-first.
export function useItemRemoval(refresh: () => Promise<void>) {
  const [removeError, setRemoveError] = useState<string | null>(null);

  const removeItem = async (itemId: string) => {
    if (!confirm('Remove this institution and all of its accounts and transactions?')) return;
    setRemoveError(null);
    const failure = 'Failed to remove item';
    try {
      await sendJson<ItemDeleteResponse>(
        `/api/items/${encodeURIComponent(itemId)}`,
        'DELETE',
        undefined,
        failure,
      );
    } catch (err) {
      setRemoveError(errorMessage(err, failure));
      return;
    }
    void refresh();
  };

  return { removeItem, removeError };
}
