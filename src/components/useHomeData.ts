'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLoadProtocol } from '@/components/useLoadProtocol';
import type { AccountsResponse, ApiAccount, ApiItem, ItemsResponse } from '@/lib/api-types';
import { readJson } from '@/lib/http';

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
  const { settled, error, loaded, clearError, load } = useLoadProtocol(
    { items: false, accounts: false },
    { stickyKeys: ['accounts'] },
  );

  const refresh = useCallback(
    () =>
      load(
        {
          items: fetch('/api/items').then((res) =>
            readJson<ItemsResponse>(res, 'Failed to load institutions'),
          ),
          accounts: fetch('/api/accounts').then((res) =>
            readJson<AccountsResponse>(res, 'Failed to load accounts'),
          ),
        },
        (results) => {
          if (results.items.status === 'fulfilled') setItemList(results.items.value.items);
          if (results.accounts.status === 'fulfilled') {
            setAccountList(results.accounts.value.accounts);
          }
        },
      ),
    [load],
  );

  // Wrapped so react-hooks/set-state-in-effect can see the async boundary.
  useEffect(() => {
    void (async () => {
      await refresh();
    })();
  }, [refresh]);

  // Re-read every minute while the tab is visible and on return to it.
  // Superseded loads write nothing, so a poll can never clobber a fresher
  // read. Design: home-reflects-background-sync.
  useEffect(() => {
    const refreshIfVisible = () => {
      if (!document.hidden) void refresh();
    };
    const interval = setInterval(refreshIfVisible, 60_000);
    document.addEventListener('visibilitychange', refreshIfVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshIfVisible);
    };
  }, [refresh]);

  return { itemList, accountList, settled, error, clearError, loaded, refresh };
}
