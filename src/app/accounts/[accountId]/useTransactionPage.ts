'use client';

import { useCallback, useState } from 'react';
import { useLoadProtocol, type LoadReads } from '@/hooks/useLoadProtocol';
import { apiPaths } from '@/lib/api-paths';
import type { ApiTransaction, TransactionsResponse } from '@/lib/api-types';
import { getJson } from '@/lib/http';
import { PAGE_SIZE } from '@/lib/pagination';
import type { CategoryPatch } from './category-patch';
import type { CategoryWriteState } from './category-write-state';

// The paged transaction list; the page-state variables and their update
// rules are tabulated in the pager-keeps-stale-rows record.
// Design: pager-keeps-stale-rows, transactions-paginated,
// partial-load-rendering.
export function useTransactionPage(accountId: string, categoryWrites: CategoryWriteState) {
  const [transactionList, setTransactionList] = useState<ApiTransaction[]>([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState<number | null>(null);
  const [loadedPage, setLoadedPage] = useState(-1);
  const [settledPage, setSettledPage] = useState<number | null>(null);
  // `loaded.transactions` is whether the latest read succeeded; a failed
  // read is not evidence of an empty account.
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
              // The merger snapshots the machine's holds so the updater stays
              // pure; the updater form is required because `previous` must be
              // the rows on screen now, not the ones this memoized closure
              // rendered with. Design: optimistic-category-writes.
              const mergeRows = categoryWrites.fetchedRowMerger();
              setTransactionList((previous) => mergeRows(incoming, previous));
              categoryWrites.releaseSettledHolds();
              setTotal(bodies.transactions.total);
              setLoadedPage(page);
              // Clamp back onto the last real page if the account shrank
              // under the pager.
              const lastPage = Math.max(0, Math.ceil(bodies.transactions.total / PAGE_SIZE) - 1);
              if (page > lastPage) setPage(lastPage);
            }
            // On failure loadedPage is left alone: the rows on screen are
            // still its rows.
            setSettledPage(page);
          },
        ),
      [accountId, page, categoryWrites],
    ),
  );

  const pageLoading = settledPage !== page || protocol.reloading;
  const shownPage = loadedPage >= 0 ? loadedPage : page;

  // After a failed read `page` may already equal the target, so a plain
  // setPage would re-run nothing; reload instead.
  const { reload } = protocol;
  const goToPage = useCallback(
    (next: number) => {
      if (next === page) reload();
      else setPage(next);
    },
    [page, reload],
  );

  // useCategoryPatches merges a row's category columns through this (the
  // write machine fences loads out of them); deliberately too narrow to
  // replace rows wholesale.
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
