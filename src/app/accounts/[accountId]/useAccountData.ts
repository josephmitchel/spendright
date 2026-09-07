'use client';

import { useCallback, useState } from 'react';
import { useLoadProtocol, type LoadReads } from '@/hooks/useLoadProtocol';
import { apiPaths } from '@/lib/api-paths';
import type {
  AccountResponse,
  ApiAccount,
  ApiCard,
  ApiCreditCategory,
  CardsResponse,
} from '@/lib/api-types';
import { getJson } from '@/lib/http';

// The account + card catalog half of the account page's data. Not keyed on
// the transaction page: paging only re-reads transactions.
// Design: partial-load-rendering, stale-lists-disable-editing.
export function useAccountData(accountId: string) {
  const [account, setAccount] = useState<ApiAccount | null>(null);
  const [card, setCard] = useState<ApiCard | null>(null);
  const [creditCategories, setCreditCategories] = useState<ApiCreditCategory[]>([]);
  const protocol = useLoadProtocol(
    { account: false, cards: false },
    useCallback(
      (load: LoadReads<'account' | 'cards'>) =>
        load(
          {
            account: getJson<AccountResponse>(
              apiPaths.account(accountId),
              'Failed to load account',
            ),
            cards: getJson<CardsResponse>(apiPaths.cards, 'Failed to load cards'),
          },
          (bodies) => {
            const loadedAccount = bodies.account ? bodies.account.account : null;
            if (bodies.account) setAccount(loadedAccount);
            if (bodies.cards) setCreditCategories(bodies.cards.creditCategories);
            // The card depends on both reads; a partial failure leaves it as
            // it was.
            if (bodies.account && bodies.cards) {
              setCard(bodies.cards.cards.find((c) => c.id === loadedAccount?.cardId) ?? null);
            }
          },
        ),
      [accountId],
    ),
  );

  return { account, card, creditCategories, ...protocol };
}
