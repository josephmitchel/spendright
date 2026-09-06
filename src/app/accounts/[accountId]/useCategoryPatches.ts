'use client';

import { useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type {
  ApiCard,
  ApiCreditCategory,
  ApiTransaction,
  TransactionPatchResponse,
} from '@/lib/api-types';
import type { CategoryKind } from '@/lib/amounts';
import { errorMessage, sendJson } from '@/lib/http';
import { serializeByKey } from '@/lib/serialize';

// The category columns a PATCH can change. Reconciliation merges only these
// into the current row: a page re-fetch mid-burst may have replaced the row,
// and its fresher non-category data must not be rolled back.
function categoryFields(row: ApiTransaction) {
  return {
    cardCategoryId: row.cardCategoryId,
    cardCategoryName: row.cardCategoryName,
    rewardRate: row.rewardRate,
    creditCategoryId: row.creditCategoryId,
    creditCategoryName: row.creditCategoryName,
  };
}

// Optimistic per-row category writes. Each row keeps a promise chain so it
// has at most one PATCH in flight and responses settle strictly in issue
// order; the pending counter therefore hits zero exactly when the burst's
// newest patch settles, which is when the row reconciles — to the newest
// committed response, or else the pre-burst baseline — and when that patch's
// failure (only) is surfaced, in that row. Design: optimistic-category-writes.
export function useCategoryPatches(
  card: ApiCard | null,
  creditCategories: ApiCreditCategory[],
  setTransactionList: Dispatch<SetStateAction<ApiTransaction[]>>,
) {
  // Each row's newest burst outcome, rendered inside the row it belongs to.
  // Keyed like the rest of the bookkeeping, so rows edited concurrently can
  // never clear or overwrite one another's failures.
  const [patchErrors, setPatchErrors] = useState<ReadonlyMap<string, string>>(new Map());

  const setRowError = (transactionId: string, message: string | null) => {
    setPatchErrors((previous) => {
      if (message === null && !previous.has(transactionId)) return previous;
      const next = new Map(previous);
      if (message === null) next.delete(transactionId);
      else next.set(transactionId, message);
      return next;
    });
  };

  // Per-row burst bookkeeping. Lives in refs, outside setState updaters,
  // which must be pure.
  const patchState = useRef(
    new Map<
      string,
      { pending: number; baseline: ApiTransaction; committed: ApiTransaction | null }
    >(),
  );
  const patchChain = useRef(new Map<string, Promise<void>>());

  const setCategory = async (row: ApiTransaction, kind: CategoryKind, categoryId: number) => {
    const transactionId = row.transactionId;
    const inFlight = patchState.current.get(transactionId);
    if (inFlight) inFlight.pending++;
    else patchState.current.set(transactionId, { pending: 1, baseline: row, committed: null });
    setRowError(transactionId, null);

    // Each kind touches only its own fields; a row never holds both kinds.
    let body: { cardCategoryId: number } | { creditCategoryId: number };
    let patch: Partial<ApiTransaction>;
    if (kind === 'card') {
      const category = card?.categories.find((c) => c.id === categoryId) ?? null;
      body = { cardCategoryId: categoryId };
      patch = {
        cardCategoryId: categoryId,
        cardCategoryName: category?.name ?? null,
        rewardRate: category?.rate ?? null,
      };
    } else {
      const category = creditCategories.find((c) => c.id === categoryId) ?? null;
      body = { creditCategoryId: categoryId };
      patch = { creditCategoryId: categoryId, creditCategoryName: category?.name ?? null };
    }

    // Optimistic update so the controlled select never snaps back.
    setTransactionList((list) =>
      list.map((txn) => (txn.transactionId === transactionId ? { ...txn, ...patch } : txn)),
    );

    const send = async () => {
      const failureMessage = 'Failed to update category';
      let failure: string | null = null;
      try {
        const data = await sendJson<TransactionPatchResponse>(
          `/api/transactions/${encodeURIComponent(transactionId)}`,
          'PATCH',
          body,
          failureMessage,
        );
        const state = patchState.current.get(transactionId);
        // In-order responses mean the latest one is always the newest.
        if (state) state.committed = data.transaction;
      } catch (err) {
        failure = errorMessage(err, failureMessage);
      }

      const state = patchState.current.get(transactionId);
      if (state && --state.pending === 0) {
        const settled = state.committed ?? state.baseline;
        patchState.current.delete(transactionId);
        setTransactionList((list) =>
          list.map((txn) =>
            txn.transactionId === transactionId ? { ...txn, ...categoryFields(settled) } : txn,
          ),
        );
        // Zero pending means this send was the burst's newest patch, so this
        // is the failure (or the all-clear) worth showing for this row.
        setRowError(transactionId, failure);
      }
    };

    // send() never rejects, so joining the row's chain is the whole await.
    await serializeByKey(patchChain.current, transactionId, send);
  };

  return { setCategory, patchErrors };
}
