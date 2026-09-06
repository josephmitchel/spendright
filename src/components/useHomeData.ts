'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AccountsResponse, ApiAccount, ApiItem, ItemsResponse } from '@/lib/api-types';
import { readJson, settleReads } from '@/lib/http';

// The items + accounts half of the home page's data, re-read on demand and on
// a visibility-gated poll: the hourly scheduled sync mutates items.error and
// balances behind an open page. Design: home-reflects-background-sync,
// partial-load-rendering, superseded-loads-write-nothing.
export function useHomeData() {
  const [itemList, setItemList] = useState<ApiItem[]>([]);
  const [accountList, setAccountList] = useState<ApiAccount[]>([]);
  // True once the first refresh has settled, success or failure.
  const [settled, setSettled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Which reads actually came back; a failed read is not evidence of anything.
  // The two flags deliberately differ in stickiness: `items` follows the
  // latest refresh, because the "No institutions" message needs current
  // evidence, while `accounts` stays true once any refresh succeeded, so a
  // later failed refresh keeps rendering the rows that did load.
  // Design: partial-load-rendering.
  const [loaded, setLoaded] = useState({ items: false, accounts: false });

  // Generation counter: a refresh superseded by a later one writes nothing.
  const refreshSeq = useRef(0);
  const refresh = useCallback(async () => {
    const seq = ++refreshSeq.current;
    // Design: partial-load-rendering — each endpoint settles on its own.
    const {
      results,
      succeeded,
      error: failureMessage,
    } = await settleReads({
      items: fetch('/api/items').then((res) =>
        readJson<ItemsResponse>(res, 'Failed to load institutions'),
      ),
      accounts: fetch('/api/accounts').then((res) =>
        readJson<AccountsResponse>(res, 'Failed to load accounts'),
      ),
    });
    if (seq !== refreshSeq.current) return;
    if (results.items.status === 'fulfilled') setItemList(results.items.value.items ?? []);
    if (results.accounts.status === 'fulfilled') {
      setAccountList(results.accounts.value.accounts ?? []);
    }
    setLoaded((previous) => ({
      items: succeeded.items,
      accounts: previous.accounts || succeeded.accounts,
    }));
    setError(failureMessage);
    setSettled(true);
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

  const clearError = () => setError(null);
  return { itemList, accountList, settled, error, clearError, loaded, refresh };
}
