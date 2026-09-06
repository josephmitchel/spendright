'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLoadProtocol } from '@/components/useLoadProtocol';
import type { ApiTransaction, TransactionsResponse } from '@/lib/api-types';
import { getJson } from '@/lib/http';

// Rows per page; always sent explicitly rather than relying on the API default.
export const PAGE_SIZE = 20;

// The paged transaction list. A page turn keeps the old rows on screen with
// the pager disabled instead of blanking the body; a failed read leaves the
// rows that are already up. `reload` re-runs the current page loudly (Retry,
// and a same-page goToPage — a plain setPage of the same value would re-run
// nothing); `refresh` re-runs it silently (the page's poll), so a background
// re-read never flashes the pager's in-flight state.
// Design: pager-keeps-stale-rows, transactions-paginated,
// partial-load-rendering, home-reflects-background-sync.
export function useTransactionPage(accountId: string) {
  const [transactionList, setTransactionList] = useState<ApiTransaction[]>([]);
  const [page, setPage] = useState(0);
  // `total` is null until a transactions read lands: "unknown", not 0.
  const [total, setTotal] = useState<number | null>(null);
  // The page the rows on screen came from (-1 until the first successful read).
  const [loadedPage, setLoadedPage] = useState(-1);
  // The request that last settled, success or failure. Keyed on both loud
  // effect inputs so a Retry of the same page still counts as in flight; a
  // silent refresh settles under the same key and so never flips pageLoading.
  const [settledRequest, setSettledRequest] = useState<{
    page: number;
    reloadToken: number;
  } | null>(null);
  // `loaded.transactions` is whether the latest read succeeded; a failed
  // read is not evidence of an empty account.
  const { settled, error, loaded, clearError, load, reload, reloadToken } = useLoadProtocol({
    transactions: false,
  });

  const refresh = useCallback(
    () =>
      load(
        {
          transactions: getJson<TransactionsResponse>(
            `/api/transactions?accountId=${encodeURIComponent(accountId)}&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`,
            'Failed to load transactions',
          ),
        },
        (results) => {
          if (results.transactions.status === 'fulfilled') {
            setTransactionList(results.transactions.value.transactions);
            setTotal(results.transactions.value.total);
            setLoadedPage(page);
            // Clamp back onto the last real page if the account shrank under
            // the pager.
            const lastPage = Math.max(
              0,
              Math.ceil(results.transactions.value.total / PAGE_SIZE) - 1,
            );
            if (page > lastPage) setPage(lastPage);
          }
          // On failure loadedPage is left alone: the rows on screen are still
          // its rows.
          setSettledRequest({ page, reloadToken });
        },
      ),
    [accountId, page, reloadToken, load],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Separate from the page-level loading flag so a page turn keeps the old
  // rows up with the pager disabled instead of blanking the account body.
  const pageLoading = settledRequest?.page !== page || settledRequest.reloadToken !== reloadToken;
  // The pager's range and buttons are based on the rows actually on screen.
  const shownPage = loadedPage >= 0 ? loadedPage : page;

  // After a failed read `page` may already equal the target, so a plain
  // setPage would re-run nothing; reload instead.
  const goToPage = (next: number) => {
    if (next === page) reload();
    else setPage(next);
  };

  return {
    transactionList,
    setTransactionList,
    total,
    pageLoading,
    shownPage,
    settled,
    error,
    clearError,
    loaded,
    goToPage,
    refresh,
    reload,
  };
}
