'use client';

import { useCallback, useState } from 'react';
import { useLoadProtocol, type LoadReads } from '@/hooks/useLoadProtocol';
import { apiPaths } from '@/lib/api-paths';
import type { AccountsResponse, ApiAccount, ApiItem, ItemsResponse } from '@/lib/api-types';
import { getJson } from '@/lib/http';

// The items + accounts half of the home page's data; the page wires the poll.
// Design: home-reflects-background-sync, partial-load-rendering.
export function useHomeData() {
  const [itemList, setItemList] = useState<ApiItem[]>([]);
  const [accountList, setAccountList] = useState<ApiAccount[]>([]);
  // `accounts` is sticky; `items` is not — the "No institutions" claim needs
  // current evidence. Design: partial-load-rendering.
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
            if (bodies.items) setItemList(bodies.items.items);
            if (bodies.accounts) setAccountList(bodies.accounts.accounts);
          },
        ),
      [],
    ),
    { stickyKeys: ['accounts'] },
  );

  return { itemList, accountList, ...protocol };
}
