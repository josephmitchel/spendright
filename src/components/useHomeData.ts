'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AccountsResponse, ApiAccount, ApiItem, ItemsResponse } from '@/lib/api-types';
import { joinedFailureMessage, readJson } from '@/lib/http';

// The items + accounts half of the home page's data, re-read on demand and on
// a visibility-gated poll: the hourly scheduled sync mutates items.error and
// balances behind an open page. Design: home-reflects-background-sync,
// partial-load-rendering, superseded-loads-write-nothing.
export function useHomeData() {
  const [itemList, setItemList] = useState<ApiItem[]>([]);
  const [accountList, setAccountList] = useState<ApiAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Whether /api/items succeeded; gates the "No institutions" message.
  const [itemsLoaded, setItemsLoaded] = useState(false);
  // Whether /api/accounts has ever succeeded; gates the per-institution
  // account tables so a failed read never renders as an empty account list.
  // Design: partial-load-rendering.
  const [accountsLoaded, setAccountsLoaded] = useState(false);

  // Generation counter: a refresh superseded by a later one writes nothing.
  const refreshSeq = useRef(0);
  const refresh = useCallback(async () => {
    const seq = ++refreshSeq.current;
    // Design: partial-load-rendering — each endpoint settles on its own.
    const [itemsResult, accountsResult] = await Promise.allSettled([
      fetch('/api/items').then((res) =>
        readJson<ItemsResponse>(res, 'Failed to load institutions'),
      ),
      fetch('/api/accounts').then((res) =>
        readJson<AccountsResponse>(res, 'Failed to load accounts'),
      ),
    ]);
    if (seq !== refreshSeq.current) return;
    if (itemsResult.status === 'fulfilled') setItemList(itemsResult.value.items ?? []);
    if (accountsResult.status === 'fulfilled') {
      setAccountList(accountsResult.value.accounts ?? []);
      // Sticky: a later failed refresh keeps rendering the rows that did load.
      setAccountsLoaded(true);
    }
    setItemsLoaded(itemsResult.status === 'fulfilled');
    setLoadError(joinedFailureMessage([itemsResult, accountsResult]));
    setLoading(false);
  }, []);

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

  const clearLoadError = () => setLoadError(null);
  return {
    itemList,
    accountList,
    loading,
    loadError,
    clearLoadError,
    itemsLoaded,
    accountsLoaded,
    refresh,
  };
}
