'use client';

import { useState } from 'react';
import type { ItemDeleteResponse } from '@/lib/api-types';
import { readJson } from '@/lib/http';

// Removing an institution (and, by cascade, its accounts and transactions),
// behind a browser confirm. Design: item-delete-plaid-first.
export function useItemRemoval(refresh: () => Promise<void>) {
  const [removeError, setRemoveError] = useState<string | null>(null);

  const removeItem = async (itemId: string) => {
    if (!confirm('Remove this institution and all of its accounts and transactions?')) return;
    setRemoveError(null);
    try {
      const res = await fetch(`/api/items/${encodeURIComponent(itemId)}`, { method: 'DELETE' });
      await readJson<ItemDeleteResponse>(res, 'Failed to remove item');
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : 'Failed to remove item');
      return;
    }
    void refresh();
  };

  return { removeItem, removeError };
}
