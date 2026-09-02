'use client';

import Link from 'next/link';
import { use, useEffect, useRef, useState } from 'react';

interface Transaction {
  transactionId: string;
  date: string;
  name: string | null;
  merchantName: string | null;
  amount: string;
  isoCurrencyCode: string | null;
  category: string | null;
  pending: boolean | null;
  cardCategoryId: number | null;
  rewardRate: string | null;
  cardCategoryName: string | null;
}

interface Account {
  accountId: string;
  name: string | null;
  officialName: string | null;
  mask: string | null;
  type: string | null;
  subtype: string | null;
  balanceAvailable: string | null;
  balanceCurrent: string | null;
  balanceLimit: string | null;
  isoCurrencyCode: string | null;
  cardId: number | null;
}

interface CardCategory {
  id: number;
  cardId: number;
  name: string;
  rate: string;
}

interface Card {
  id: number;
  slug: string;
  name: string;
  issuer: string | null;
  type: 'cashback' | 'points';
  categories: CardCategory[];
}

export default function AccountPage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const { accountId } = use(params);
  const [account, setAccount] = useState<Account | null>(null);
  const [card, setCard] = useState<Card | null>(null);
  const [transactionList, setTransactionList] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [accountRes, txnRes, cardsRes] = await Promise.all([
          fetch(`/api/accounts?accountId=${encodeURIComponent(accountId)}`),
          fetch(`/api/transactions?accountId=${encodeURIComponent(accountId)}`),
          fetch('/api/cards'),
        ]);
        const accountData = await accountRes.json();
        const txnData = await txnRes.json();
        const cardsData = await cardsRes.json();
        if (!accountRes.ok) throw new Error(accountData?.error?.message || 'Failed to load account');
        if (!txnRes.ok) throw new Error(txnData?.error?.message || 'Failed to load transactions');
        if (!cardsRes.ok) throw new Error(cardsData?.error?.message || 'Failed to load cards');
        const loadedAccount: Account | null = accountData.accounts?.[0] ?? null;
        setAccount(loadedAccount);
        setTransactionList(txnData.transactions ?? []);
        setCard(
          (cardsData.cards ?? []).find((c: Card) => c.id === loadedAccount?.cardId) ?? null,
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, [accountId]);

  // Monotonic sequence per transaction so a stale PATCH response (or its
  // error) can never override a newer selection.
  const patchSeq = useRef(new Map<string, number>());

  const setCategory = async (transactionId: string, cardCategoryId: number | null) => {
    const seq = (patchSeq.current.get(transactionId) ?? 0) + 1;
    patchSeq.current.set(transactionId, seq);

    const category =
      cardCategoryId !== null
        ? (card?.categories.find((c) => c.id === cardCategoryId) ?? null)
        : null;

    // Optimistic update, synchronously in the change event, so the controlled
    // select never snaps back while the request is in flight.
    let previous: Transaction | undefined;
    setTransactionList((list) =>
      list.map((txn) => {
        if (txn.transactionId !== transactionId) return txn;
        previous = txn;
        return {
          ...txn,
          cardCategoryId,
          rewardRate: category?.rate ?? null,
          cardCategoryName: category?.name ?? null,
        };
      }),
    );

    try {
      const res = await fetch(`/api/transactions/${encodeURIComponent(transactionId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardCategoryId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || 'Failed to update category');
      if (patchSeq.current.get(transactionId) !== seq) return; // superseded
      setTransactionList((list) =>
        list.map((txn) =>
          txn.transactionId === transactionId ? { ...txn, ...data.transaction } : txn,
        ),
      );
    } catch (err) {
      if (patchSeq.current.get(transactionId) !== seq) return; // superseded
      setTransactionList((list) =>
        list.map((txn) =>
          txn.transactionId === transactionId && previous ? previous : txn,
        ),
      );
      alert(err instanceof Error ? err.message : 'Failed to update category');
    }
  };

  const rateHeader = card ? (card.type === 'points' ? 'Multiplier' : 'Cashback %') : 'Rate';

  return (
    <main>
      <p>
        <Link href="/">&larr; Back</Link>
      </p>
      <h1>{account ? (account.name ?? account.officialName ?? account.accountId) : 'Account'}</h1>
      {account && (
        <p>
          {account.officialName && account.officialName !== account.name
            ? `${account.officialName} — `
            : ''}
          {account.mask ? `••${account.mask} — ` : ''}
          {account.type}
          {account.subtype ? ` / ${account.subtype}` : ''}
          {' — current: '}
          {account.balanceCurrent ?? '—'}
          {', available: '}
          {account.balanceAvailable ?? '—'}
          {account.balanceLimit != null ? `, limit: ${account.balanceLimit}` : ''}
          {account.isoCurrencyCode ? ` ${account.isoCurrencyCode}` : ''}
        </p>
      )}
      {account && (
        <p>
          {card
            ? `Card: ${card.name} (${card.type})`
            : 'No card definition matched for this account.'}
        </p>
      )}
      <h2>Transactions</h2>
      {loading && <p>Loading…</p>}
      {error && <p>Error: {error}</p>}
      {!loading && !error && transactionList.length === 0 && <p>No transactions.</p>}
      {transactionList.length > 0 && (
        <table border={1}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Name</th>
              <th>Merchant</th>
              <th>Amount</th>
              <th>Currency</th>
              <th>Category</th>
              <th>{rateHeader}</th>
              <th>Pending</th>
            </tr>
          </thead>
          <tbody>
            {transactionList.map((txn) => (
              <tr key={txn.transactionId}>
                <td>{txn.date}</td>
                <td>{txn.name}</td>
                <td>{txn.merchantName}</td>
                <td>{txn.amount}</td>
                <td>{txn.isoCurrencyCode}</td>
                <td>
                  {card ? (
                    <select
                      value={txn.cardCategoryId ?? ''}
                      onChange={(e) =>
                        setCategory(
                          txn.transactionId,
                          e.target.value === '' ? null : Number(e.target.value),
                        )
                      }
                    >
                      <option value="" disabled hidden>
                        none
                      </option>
                      {card.categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    'none'
                  )}
                </td>
                <td>{txn.rewardRate}</td>
                <td>{txn.pending ? 'yes' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
