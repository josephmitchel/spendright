'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLoadProtocol, type LoadReads } from '@/hooks/useLoadProtocol';
import { apiPaths } from '@/lib/api-paths';
import type { ApiTransaction, TransactionsResponse } from '@/lib/api-types';
import { getJson } from '@/lib/http';
import { PAGE_SIZE } from '@/lib/pagination';
import type { CategoryPatch } from './category-patch';
import type { CategoryWriteState } from './category-write-state';

// The page lives in the URL (1-based ?page=) so a refresh, bookmark, or
// back-navigation lands on the same page instead of resetting to the first.
// Nothing page-dependent renders before the first fetch settles, so the lazy
// client-side read can't cause a hydration mismatch.
function pageFromLocation(): number {
  if (typeof window === 'undefined') return 0;
  const parsed = Number(new URLSearchParams(window.location.search).get('page'));
  return Number.isInteger(parsed) && parsed > 1 ? parsed - 1 : 0;
}

export function useTransactionPage(accountId: string, categoryWrites: CategoryWriteState) {
  const [transactionList, setTransactionList] = useState<ApiTransaction[]>([]);
  const [page, setPage] = useState(pageFromLocation);
  const [total, setTotal] = useState<number | null>(null);
  const [loadedPage, setLoadedPage] = useState(-1);
  const [settledPage, setSettledPage] = useState<number | null>(null);
  const protocol = useLoadProtocol(
    { transactions: false },
    useCallback(
      (load: LoadReads<'transactions'>) =>
        load(
          {
            transactions: getJson<TransactionsResponse>(
              apiPaths.transactions(accountId, PAGE_SIZE, page * PAGE_SIZE),
              'Failed to load transactions',
            ),
          },
          (bodies) => {
            if (bodies.transactions) {
              const incoming = bodies.transactions.transactions;
              const mergeRows = categoryWrites.fetchedRowMerger();
              setTransactionList((previous) => mergeRows(incoming, previous));
              categoryWrites.releaseSettledHolds();
              setTotal(bodies.transactions.total);
              setLoadedPage(page);
              const lastPage = Math.max(0, Math.ceil(bodies.transactions.total / PAGE_SIZE) - 1);
              if (page > lastPage) setPage(lastPage);
            }
            setSettledPage(page);
          },
        ),
      [accountId, page, categoryWrites],
    ),
  );

  useEffect(() => {
    const url = new URL(window.location.href);
    if (page === 0) url.searchParams.delete('page');
    else url.searchParams.set('page', String(page + 1));
    // replaceState (not push) so paging doesn't pile up history entries; the
    // router's own state object must ride along untouched.
    window.history.replaceState(window.history.state, '', url);
  }, [page]);

  const pageLoading = settledPage !== page || protocol.reloading;
  const shownPage = loadedPage >= 0 ? loadedPage : page;

  // Retrying the current page: setPage(page) re-runs nothing, so reload instead.
  const { reload } = protocol;
  const goToPage = useCallback(
    (next: number) => {
      if (next === page) reload();
      else setPage(next);
    },
    [page, reload],
  );

  const applyCategoryPatch = useCallback((transactionId: string, fields: CategoryPatch) => {
    setTransactionList((list) =>
      list.map((txn) => (txn.transactionId === transactionId ? { ...txn, ...fields } : txn)),
    );
  }, []);

  return {
    transactionList,
    applyCategoryPatch,
    total,
    pageLoading,
    shownPage,
    goToPage,
    ...protocol,
  };
}
