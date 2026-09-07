'use client';

import { useCallback, useRef, useState } from 'react';
import { apiPaths } from '@/lib/api-paths';
import type {
  ApiCard,
  ApiCreditCategory,
  ApiTransaction,
  TransactionPatchResponse,
} from '@/lib/api-types';
import { serializeByKey } from '@/lib/async-coordination';
import { assertNeverKind, categoryKindKeys, type CategoryKind } from '@/lib/category-kinds';
import { errorMessage, sendJson } from '@/lib/http';
import type { CategoryPatch } from './category-patch';
import type { CategoryWriteState } from './category-write-state';

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

// Optimistic per-row category writes, driving the shared CategoryWriteState.
// Each row keeps a promise chain (at most one PATCH in flight, responses
// settle in issue order), so the machine's pending counter hits zero exactly
// when the burst's newest patch settles.
// Design: optimistic-category-writes.
export function useCategoryPatches(
  card: ApiCard | null,
  creditCategories: ApiCreditCategory[],
  applyCategoryPatch: (transactionId: string, fields: CategoryPatch) => void,
  writeState: CategoryWriteState,
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

  const patchChain = useRef(new Map<string, Promise<void>>());

  const setCategory = useCallback(
    async (row: ApiTransaction, kind: CategoryKind, categoryId: number) => {
      const transactionId = row.transactionId;
      writeState.joinBurst(row);
      setRowError(transactionId, null);
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
          writeState.recordCommit(transactionId, data.transaction);
        } catch (err) {
          failure = errorMessage(err, failureMessage);
        }
        const settledFields = writeState.settleIfDone(transactionId);
        if (settledFields) {
          applyCategoryPatch(transactionId, settledFields);
          setRowError(transactionId, failure);
        }
      };

      // send() never rejects, so joining the row's chain is the whole await.
      await serializeByKey(patchChain.current, transactionId, send);
    },
    [card, creditCategories, applyCategoryPatch, writeState, setRowError],
  );

  // For the page to call when the pager leaves the page the errors were
  // raised on.
  const clearPatchErrors = useCallback(() => setPatchErrors(new Map()), []);

  return { setCategory, patchErrors, clearPatchErrors };
}
