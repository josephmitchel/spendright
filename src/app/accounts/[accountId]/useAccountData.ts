'use client';

import { useEffect, useState } from 'react';
import type {
  AccountsResponse,
  ApiAccount,
  ApiCard,
  ApiCreditCategory,
  CardsResponse,
} from '@/lib/api-types';
import { readJson, settleReads } from '@/lib/http';

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
      // Settled together so one failure doesn't discard the sibling that did
      // arrive (design: partial-load-rendering).
      const {
        results,
        succeeded,
        error: failureMessage,
      } = await settleReads({
        account: fetch(`/api/accounts?accountId=${encodeURIComponent(accountId)}`).then((res) =>
          readJson<AccountsResponse>(res, 'Failed to load account'),
        ),
        cards: fetch('/api/cards').then((res) =>
          readJson<CardsResponse>(res, 'Failed to load cards'),
        ),
      });
      if (cancelled) return;

      const loadedAccount =
        results.account.status === 'fulfilled' ? (results.account.value.accounts[0] ?? null) : null;
      if (results.account.status === 'fulfilled') setAccount(loadedAccount);
      if (results.cards.status === 'fulfilled') {
        setCreditCategories(results.cards.value.creditCategories ?? []);
        // The card depends on both reads, so it is only recomputed when both
        // succeeded; otherwise it is left as it was.
        if (results.account.status === 'fulfilled') {
          const cards = results.cards.value.cards ?? [];
          setCard(cards.find((c) => c.id === loadedAccount?.cardId) ?? null);
        }
      }
      setLoaded(succeeded);
      setError(failureMessage);
      setSettled(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId, reloadKey]);

  const clearError = () => setError(null);
  return { account, card, creditCategories, settled, error, clearError, loaded };
}
