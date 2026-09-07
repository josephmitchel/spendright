'use client';

import { useCallback, useRef, useState } from 'react';
import { apiPaths } from '@/lib/api-paths';
import type {
  ApiCard,
  ApiCreditCategory,
  ApiTransaction,
  TransactionPatchResponse,
} from '@/lib/api-types';
import { assertNeverKind, categoryKindKeys, type CategoryKind } from '@/lib/category-kinds';
import { errorMessage, sendJson } from '@/lib/http';
import { serializeByKey } from '@/lib/serialize';

// The category columns a PATCH can change — every kind's name and write
// columns, all derived from categoryKindKeys so a new kind widens this type
// by itself. The widest write this hook can hand applyCategoryPatch, so a
// page re-fetch's fresher non-category data can never be rolled back.
// Design: optimistic-category-writes.
export type CategoryPatch = Partial<
  Pick<
    ApiTransaction,
    | (typeof categoryKindKeys)[CategoryKind]['name']
    | (typeof categoryKindKeys)[CategoryKind]['writeColumns'][number]
  >
>;

// Every category column of one row. Required<>: a kind added to
// categoryKindKeys widens CategoryPatch, so omitting its columns here is a
// compile error instead of a field the reconcile silently drops.
// Design: category-kind-exhaustive.
export function categoryFields(row: ApiTransaction): Required<CategoryPatch> {
  return {
    cardCategoryId: row.cardCategoryId,
    cardCategoryName: row.cardCategoryName,
    rewardRate: row.rewardRate,
    creditCategoryId: row.creditCategoryId,
    creditCategoryName: row.creditCategoryName,
  };
}

// The wire body and optimistic patch for one kind's selection. The wire key
// comes from the kind→key mapping shared with the PATCH route's parser.
function kindSelection(
  kind: CategoryKind,
  categoryId: number,
  card: ApiCard | null,
  creditCategories: ApiCreditCategory[],
): {
  body: { [categoryKindKeys.card.id]: number } | { [categoryKindKeys.credit.id]: number };
  patch: CategoryPatch;
} {
  switch (kind) {
    case 'card': {
      const category = card?.categories.find((c) => c.id === categoryId) ?? null;
      return {
        body: { [categoryKindKeys.card.id]: categoryId },
        patch: {
          cardCategoryId: categoryId,
          cardCategoryName: category?.name ?? null,
          rewardRate: category?.rate ?? null,
        },
      };
    }
    case 'credit': {
      const category = creditCategories.find((c) => c.id === categoryId) ?? null;
      return {
        body: { [categoryKindKeys.credit.id]: categoryId },
        patch: { creditCategoryId: categoryId, creditCategoryName: category?.name ?? null },
      };
    }
    default:
      return assertNeverKind(kind);
  }
}

// Optimistic per-row category writes. Each row keeps a promise chain (at
// most one PATCH in flight, responses settle in issue order), so the pending
// counter hits zero exactly when the burst's newest patch settles — the row
// then reconciles to the newest committed response, or else the pre-burst
// baseline. Design: optimistic-category-writes.
export function useCategoryPatches(
  card: ApiCard | null,
  creditCategories: ApiCreditCategory[],
  applyCategoryPatch: (transactionId: string, fields: CategoryPatch) => void,
  // Marks a row's category fields as owned by an open burst, so a load that
  // settles mid-burst merges around them instead of snapping the select back.
  setCategoryHold: (transactionId: string, held: boolean) => void,
) {
  // Each row's newest burst outcome, rendered inside the row it belongs to.
  const [patchErrors, setPatchErrors] = useState<ReadonlyMap<string, string>>(new Map());

  const setRowError = useCallback((transactionId: string, message: string | null) => {
    setPatchErrors((previous) => {
      if (message === null && !previous.has(transactionId)) return previous;
      const next = new Map(previous);
      if (message === null) next.delete(transactionId);
      else next.set(transactionId, message);
      return next;
    });
  }, []);

  // Per-row burst bookkeeping. Lives in refs, outside setState updaters,
  // which must be pure.
  const patchState = useRef(
    new Map<
      string,
      { pending: number; baseline: ApiTransaction; committed: ApiTransaction | null }
    >(),
  );
  const patchChain = useRef(new Map<string, Promise<void>>());

  // Counts this patch into the row's burst, opening one (with `row` as the
  // pre-burst baseline) if none is running.
  const joinBurst = useCallback(
    (row: ApiTransaction) => {
      const inFlight = patchState.current.get(row.transactionId);
      if (inFlight) inFlight.pending++;
      else {
        patchState.current.set(row.transactionId, { pending: 1, baseline: row, committed: null });
      }
      setCategoryHold(row.transactionId, true);
      setRowError(row.transactionId, null);
    },
    [setCategoryHold, setRowError],
  );

  // Reconciles the row and surfaces this patch's outcome — but only when it
  // was the burst's newest; an older patch's settle just decrements.
  const settleBurstIfDone = useCallback(
    (transactionId: string, failure: string | null) => {
      const state = patchState.current.get(transactionId);
      if (!state || --state.pending > 0) return;
      const settled = state.committed ?? state.baseline;
      patchState.current.delete(transactionId);
      setCategoryHold(transactionId, false);
      applyCategoryPatch(transactionId, categoryFields(settled));
      setRowError(transactionId, failure);
    },
    [applyCategoryPatch, setCategoryHold, setRowError],
  );

  const setCategory = useCallback(
    async (row: ApiTransaction, kind: CategoryKind, categoryId: number) => {
      const transactionId = row.transactionId;
      joinBurst(row);
      const { body, patch } = kindSelection(kind, categoryId, card, creditCategories);

      // Optimistic update so the controlled select never snaps back.
      applyCategoryPatch(transactionId, patch);

      const send = async () => {
        const failureMessage = 'Failed to update category';
        let failure: string | null = null;
        try {
          const data = await sendJson<TransactionPatchResponse>(
            apiPaths.transaction(transactionId),
            'PATCH',
            body,
            failureMessage,
          );
          // In-order responses mean the latest one is always the newest.
          const state = patchState.current.get(transactionId);
          if (state) state.committed = data.transaction;
        } catch (err) {
          failure = errorMessage(err, failureMessage);
        }
        settleBurstIfDone(transactionId, failure);
      };

      // send() never rejects, so joining the row's chain is the whole await.
      await serializeByKey(patchChain.current, transactionId, send);
    },
    [card, creditCategories, applyCategoryPatch, joinBurst, settleBurstIfDone],
  );

  // For the page to call when the pager leaves the page the errors were
  // raised on.
  const clearPatchErrors = useCallback(() => setPatchErrors(new Map()), []);

  return { setCategory, patchErrors, clearPatchErrors };
}
