'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLoadProtocol } from '@/components/useLoadProtocol';
import type {
  AccountsResponse,
  ApiAccount,
  ApiCard,
  ApiCreditCategory,
  CardsResponse,
} from '@/lib/api-types';
import { getJson } from '@/lib/http';

// The account + card catalog half of the account page's data. Not keyed on
// the transaction page: paging only re-reads transactions. `reload` re-runs
// the load loudly (Retry); `refresh` re-runs it silently (the page's poll).
// Design: partial-load-rendering, stale-lists-disable-editing,
// home-reflects-background-sync.
export function useAccountData(accountId: string) {
  const [account, setAccount] = useState<ApiAccount | null>(null);
  const [card, setCard] = useState<ApiCard | null>(null);
  const [creditCategories, setCreditCategories] = useState<ApiCreditCategory[]>([]);
  const { settled, error, loaded, clearError, load, reload, reloadToken } = useLoadProtocol({
    account: false,
    cards: false,
  });

  const refresh = useCallback(
    () =>
      load(
        {
          account: getJson<AccountsResponse>(
            `/api/accounts?accountId=${encodeURIComponent(accountId)}`,
            'Failed to load account',
          ),
          cards: getJson<CardsResponse>('/api/cards', 'Failed to load cards'),
        },
        (results) => {
          // Each read's body, or null where it failed; the flat guards below
          // read like the rule they enforce.
          const accountBody = results.account.status === 'fulfilled' ? results.account.value : null;
          const cardsBody = results.cards.status === 'fulfilled' ? results.cards.value : null;
          const loadedAccount = accountBody ? (accountBody.accounts[0] ?? null) : null;
          if (accountBody) setAccount(loadedAccount);
          if (cardsBody) setCreditCategories(cardsBody.creditCategories);
          // The card depends on both reads, so it is only recomputed when both
          // succeeded; a partial failure leaves it as it was.
          if (accountBody && cardsBody) {
            setCard(cardsBody.cards.find((c) => c.id === loadedAccount?.cardId) ?? null);
          }
        },
      ),
    [accountId, load],
  );

  useEffect(() => {
    void refresh();
  }, [refresh, reloadToken]);

  return { account, card, creditCategories, settled, error, clearError, loaded, refresh, reload };
}
