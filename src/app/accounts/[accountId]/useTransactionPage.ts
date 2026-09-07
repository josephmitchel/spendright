'use client';

import { useCallback, useRef, useState } from 'react';
import { useLoadProtocol, type LoadReads } from '@/hooks/useLoadProtocol';
import { apiPaths } from '@/lib/api-paths';
import type { ApiTransaction, TransactionsResponse } from '@/lib/api-types';
import { getJson } from '@/lib/http';
import { PAGE_SIZE } from '@/lib/pagination';
import { categoryFields, type CategoryPatch } from './category-patch';

// The paged transaction list; the page-state variables and their update
// rules are tabulated in the pager-keeps-stale-rows record.
// Design: pager-keeps-stale-rows, transactions-paginated,
// partial-load-rendering.
export function useTransactionPage(accountId: string) {
  const [transactionList, setTransactionList] = useState<ApiTransaction[]>([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState<number | null>(null);
  const [loadedPage, setLoadedPage] = useState(-1);
  const [settledPage, setSettledPage] = useState<number | null>(null);
  // Rows whose category fields a load may not overwrite: `held` while a
  // patch burst is open, then `releasing` until the next successful load —
  // a poll whose response was read before the burst's PATCH committed can
  // settle after the burst ends and would otherwise snap the select back.
  // Design: optimistic-category-writes.
  const heldCategoryRows = useRef(new Map<string, 'held' | 'releasing'>());
  const setCategoryHold = useCallback((transactionId: string, held: boolean) => {
    if (held) heldCategoryRows.current.set(transactionId, 'held');
    else if (heldCategoryRows.current.has(transactionId)) {
      heldCategoryRows.current.set(transactionId, 'releasing');
    }
  }, []);
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
              // Snapshot the holds so the updater stays pure; the updater
              // form is required because `previous` must be the rows on
              // screen now, not the ones this memoized closure rendered with.
              const holds = new Map(heldCategoryRows.current);
              setTransactionList((previous) =>
                holds.size === 0
                  ? incoming
                  : incoming.map((txn) => {
                      if (!holds.has(txn.transactionId)) return txn;
                      const shown = previous.find(
                        (row) => row.transactionId === txn.transactionId,
                      );
                      return shown ? { ...txn, ...categoryFields(shown) } : txn;
                    }),
              );
              for (const [transactionId, hold] of holds) {
                if (hold === 'releasing') heldCategoryRows.current.delete(transactionId);
              }
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
      [accountId, page],
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

  // useCategoryPatches merges a row's category columns through this (and
  // fences loads out of them via setCategoryHold); deliberately too narrow
  // to replace rows wholesale.
  // Design: optimistic-category-writes, superseded-loads-write-nothing.
  const applyCategoryPatch = useCallback((transactionId: string, fields: CategoryPatch) => {
    setTransactionList((list) =>
      list.map((txn) => (txn.transactionId === transactionId ? { ...txn, ...fields } : txn)),
    );
  }, []);

  return {
    transactionList,
    applyCategoryPatch,
    setCategoryHold,
    total,
    pageLoading,
    shownPage,
    goToPage,
    ...protocol,
  };
}
