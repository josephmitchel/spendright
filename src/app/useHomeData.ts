'use client';

import { useCallback, useState } from 'react';
import { useLoadProtocol, type LoadReads } from '@/hooks/useLoadProtocol';
import { apiPaths } from '@/lib/api-paths';
import type { AccountsResponse, ApiAccount, ApiItem, ItemsResponse } from '@/lib/api-types';
import { getJson } from '@/lib/http';

export function useHomeData() {
  const [itemList, setItemList] = useState<ApiItem[]>([]);
  const [accountList, setAccountList] = useState<ApiAccount[]>([]);
  const [lastSync, setLastSync] = useState<ItemsResponse['lastSync']>(null);
  const protocol = useLoadProtocol(
    { items: false, accounts: false },
    useCallback(
      (load: LoadReads<'items' | 'accounts'>) =>
        load(
          {
            items: getJson<ItemsResponse>(apiPaths.items, 'Failed to load institutions'),
            accounts: getJson<AccountsResponse>(apiPaths.accounts, 'Failed to load accounts'),
          },
          (bodies) => {
            if (bodies.items) {
              setItemList(bodies.items.items);
              setLastSync(bodies.items.lastSync);
            }
            if (bodies.accounts) setAccountList(bodies.accounts.accounts);
          },
        ),
      [],
    ),
    // Both sticky: an established view (including "no institutions yet") must
    // survive a transient poll failure instead of blanking until the next poll.
    { stickyKeys: ['items', 'accounts'] },
  );

  return { itemList, accountList, lastSync, ...protocol };
}
