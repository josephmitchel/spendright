'use client';

import { useEffect, useState } from 'react';
import type {
  AccountsResponse,
  ApiAccount,
  ApiCard,
  ApiCreditCategory,
  CardsResponse,
} from '@/lib/api-types';
import { joinedFailureMessage, readJson } from '@/lib/http';

// The account + card catalog half of the account page's data. Not keyed on
// the transaction page: paging only re-reads transactions. `reloadKey` re-runs
// the load (Retry). Design: partial-load-rendering, stale-lists-disable-editing.
export function useAccountData(accountId: string, reloadKey: number) {
  const [account, setAccount] = useState<ApiAccount | null>(null);
  const [card, setCard] = useState<ApiCard | null>(null);
  const [creditCategories, setCreditCategories] = useState<ApiCreditCategory[]>([]);
  // True once the load effect has settled, success or failure.
  const [settled, setSettled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Which reads actually came back; a failed read is not evidence of anything.
  const [loaded, setLoaded] = useState({ account: false, cards: false });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // allSettled so one failure doesn't discard the sibling that did arrive
      // (design: partial-load-rendering).
      const [accountResult, cardsResult] = await Promise.allSettled([
        fetch(`/api/accounts?accountId=${encodeURIComponent(accountId)}`).then((res) =>
          readJson<AccountsResponse>(res, 'Failed to load account'),
        ),
        fetch('/api/cards').then((res) => readJson<CardsResponse>(res, 'Failed to load cards')),
      ]);
      if (cancelled) return;

      const loadedAccount =
        accountResult.status === 'fulfilled' ? (accountResult.value.accounts[0] ?? null) : null;
      if (accountResult.status === 'fulfilled') setAccount(loadedAccount);
      if (cardsResult.status === 'fulfilled') {
        setCreditCategories(cardsResult.value.creditCategories ?? []);
        // The card depends on both reads, so it is only recomputed when both
        // succeeded; otherwise it is left as it was.
        if (accountResult.status === 'fulfilled') {
          const cards = cardsResult.value.cards ?? [];
          setCard(cards.find((c) => c.id === loadedAccount?.cardId) ?? null);
        }
      }
      setLoaded({
        account: accountResult.status === 'fulfilled',
        cards: cardsResult.status === 'fulfilled',
      });
      setError(joinedFailureMessage([accountResult, cardsResult]));
      setSettled(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId, reloadKey]);

  const clearError = () => setError(null);
  return { account, card, creditCategories, settled, error, clearError, loaded };
}
