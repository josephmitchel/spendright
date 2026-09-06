'use client';

import { useEffect, useState } from 'react';
import { useLoadProtocol } from '@/components/useLoadProtocol';
import type { ApiTransaction, TransactionsResponse } from '@/lib/api-types';
import { readJson, settleReads } from '@/lib/http';

// Rows per page; always sent explicitly rather than relying on the API default.
export const PAGE_SIZE = 20;

// The paged transaction list. A page turn keeps the old rows on screen with
// the pager disabled instead of blanking the body; a failed read leaves the
// rows that are already up. `reload` re-runs the effect for the current page
// (a plain setPage of the same value would re-run nothing).
// Design: pager-keeps-stale-rows, transactions-paginated, partial-load-rendering.
export function useTransactionPage(accountId: string, reloadKey: number, reload: () => void) {
  const [transactionList, setTransactionList] = useState<ApiTransaction[]>([]);
  const [page, setPage] = useState(0);
  // `total` is null until a transactions read lands: "unknown", not 0.
  const [total, setTotal] = useState<number | null>(null);
  // The page the rows on screen came from (-1 until the first successful read).
  const [loadedPage, setLoadedPage] = useState(-1);
  // The request that last settled, success or failure. Keyed on both effect
  // inputs so a Retry of the same page still counts as in flight.
  const [settledRequest, setSettledRequest] = useState<{ page: number; reloadKey: number } | null>(
    null,
  );
  // `loaded.transactions` is whether the latest read succeeded; a failed
  // read is not evidence of an empty account.
  const { settled, setSettled, error, setError, loaded, setLoaded, clearError } = useLoadProtocol({
    transactions: false,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        results,
        succeeded,
        error: failureMessage,
      } = await settleReads({
        transactions: fetch(
          `/api/transactions?accountId=${encodeURIComponent(accountId)}&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`,
        ).then((res) => readJson<TransactionsResponse>(res, 'Failed to load transactions')),
      });
      if (cancelled) return;

      if (results.transactions.status === 'fulfilled') {
        setTransactionList(results.transactions.value.transactions ?? []);
        setTotal(results.transactions.value.total);
        setLoadedPage(page);
      }
      // On failure loadedPage is left alone: the rows on screen are still its
      // rows. `failureMessage` is null on success, so this also clears.
      setError(failureMessage);
      setLoaded(succeeded);
      setSettledRequest({ page, reloadKey });
      setSettled(true);

      // Clamp back onto the last real page if the account shrank under the pager.
      if (results.transactions.status === 'fulfilled') {
        const lastPage = Math.max(0, Math.ceil(results.transactions.value.total / PAGE_SIZE) - 1);
        if (page > lastPage) setPage(lastPage);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId, page, reloadKey, setError, setLoaded, setSettled]);

  // Separate from the page-level loading flag so a page turn keeps the old
  // rows up with the pager disabled instead of blanking the account body.
  const pageLoading = settledRequest?.page !== page || settledRequest.reloadKey !== reloadKey;
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
  };
}
