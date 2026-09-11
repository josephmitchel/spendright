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

export function useCategoryPatches(
  card: ApiCard | null,
  creditCategories: ApiCreditCategory[],
  applyCategoryPatch: (transactionId: string, fields: CategoryPatch) => void,
  writeState: CategoryWriteState,
) {
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

      await serializeByKey(patchChain.current, transactionId, send);
    },
    [card, creditCategories, applyCategoryPatch, writeState, setRowError],
  );

  const clearPatchErrors = useCallback(() => setPatchErrors(new Map()), []);

  return { setCategory, patchErrors, clearPatchErrors };
}
