'use client';

import { useCallback, useState } from 'react';
import { useLoadProtocol, type LoadReads } from '@/hooks/useLoadProtocol';
import { apiPaths } from '@/lib/api-paths';
import type { ApiTransaction, TransactionsResponse } from '@/lib/api-types';
import { getJson } from '@/lib/http';
import { PAGE_SIZE } from '@/lib/pagination';
import type { CategoryPatch } from './category-patch';
import type { CategoryWriteState } from './category-write-state';

// Design: pager-keeps-stale-rows, transactions-paginated,
// partial-load-rendering.
export function useTransactionPage(accountId: string, categoryWrites: CategoryWriteState) {
  const [transactionList, setTransactionList] = useState<ApiTransaction[]>([]);
  const [page, setPage] = useState(0);
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
              // Design: optimistic-category-writes.
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

  // Design: optimistic-category-writes, superseded-loads-write-nothing.
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
