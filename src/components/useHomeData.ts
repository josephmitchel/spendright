'use client';

import { useCallback, useState } from 'react';
import { useLoadProtocol, type LoadReads } from '@/components/useLoadProtocol';
import { useVisiblePoll } from '@/components/useVisiblePoll';
import type { AccountsResponse, ApiAccount, ApiItem, ItemsResponse } from '@/lib/api-types';
import { getJson } from '@/lib/http';

// The items + accounts half of the home page's data, re-read on demand and on
// a visibility-gated poll: the hourly scheduled sync mutates items.error and
// balances behind an open page. Design: home-reflects-background-sync,
// partial-load-rendering, superseded-loads-write-nothing.
export function useHomeData() {
  const [itemList, setItemList] = useState<ApiItem[]>([]);
  const [accountList, setAccountList] = useState<ApiAccount[]>([]);
  // `accounts` is sticky: a later failed refresh keeps rendering the rows
  // that did load. `items` follows the latest refresh, because the "No
  // institutions" message needs current evidence. Design: partial-load-rendering.
  const { settled, error, loaded, clearError, refresh, reload } = useLoadProtocol(
    { items: false, accounts: false },
    useCallback(
      (load: LoadReads<'items' | 'accounts'>) =>
        load(
          {
            items: getJson<ItemsResponse>('/api/items', 'Failed to load institutions'),
            accounts: getJson<AccountsResponse>('/api/accounts', 'Failed to load accounts'),
          },
          (results) => {
            if (results.items.status === 'fulfilled') setItemList(results.items.value.items);
            if (results.accounts.status === 'fulfilled') {
              setAccountList(results.accounts.value.accounts);
            }
          },
        ),
      [],
    ),
    { stickyKeys: ['accounts'] },
  );

  // Re-read every minute while the tab is visible and on return to it.
  // Design: home-reflects-background-sync.
  useVisiblePoll(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  return { itemList, accountList, settled, error, clearError, loaded, refresh, reload };
}
