'use client';

import { useEffect, useState } from 'react';
import { useLoadProtocol } from '@/components/useLoadProtocol';
import type {
  AccountsResponse,
  ApiAccount,
  ApiCard,
  ApiCreditCategory,
  CardsResponse,
} from '@/lib/api-types';
import { readJson } from '@/lib/http';

// The account + card catalog half of the account page's data. Not keyed on
// the transaction page: paging only re-reads transactions. `reloadKey` re-runs
// the load (Retry). Design: partial-load-rendering, stale-lists-disable-editing.
export function useAccountData(accountId: string, reloadKey: number) {
  const [account, setAccount] = useState<ApiAccount | null>(null);
  const [card, setCard] = useState<ApiCard | null>(null);
  const [creditCategories, setCreditCategories] = useState<ApiCreditCategory[]>([]);
  const { settled, error, loaded, clearError, load } = useLoadProtocol({
    account: false,
    cards: false,
  });

  useEffect(() => {
    void load(
      {
        account: fetch(`/api/accounts?accountId=${encodeURIComponent(accountId)}`).then((res) =>
          readJson<AccountsResponse>(res, 'Failed to load account'),
        ),
        cards: fetch('/api/cards').then((res) =>
          readJson<CardsResponse>(res, 'Failed to load cards'),
        ),
      },
      (results) => {
        const loadedAccount =
          results.account.status === 'fulfilled'
            ? (results.account.value.accounts[0] ?? null)
            : null;
        if (results.account.status === 'fulfilled') setAccount(loadedAccount);
        if (results.cards.status === 'fulfilled') {
          setCreditCategories(results.cards.value.creditCategories);
          // The card depends on both reads, so it is only recomputed when both
          // succeeded; otherwise it is left as it was.
          if (results.account.status === 'fulfilled') {
            const cards = results.cards.value.cards;
            setCard(cards.find((c) => c.id === loadedAccount?.cardId) ?? null);
          }
        }
      },
    );
  }, [accountId, reloadKey, load]);

  return { account, card, creditCategories, settled, error, clearError, loaded };
}
