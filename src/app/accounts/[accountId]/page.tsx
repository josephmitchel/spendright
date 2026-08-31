'use client';

import Link from 'next/link';
import { use, useEffect, useState } from 'react';

interface Transaction {
  transactionId: string;
  date: string;
  name: string | null;
  merchantName: string | null;
  amount: string;
  isoCurrencyCode: string | null;
  category: string | null;
  pending: boolean | null;
}

export default function AccountPage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const { accountId } = use(params);
  const [transactionList, setTransactionList] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/transactions?accountId=${encodeURIComponent(accountId)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error?.message || 'Failed to load transactions');
        setTransactionList(data.transactions ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load transactions');
      } finally {
        setLoading(false);
      }
    })();
  }, [accountId]);

  return (
    <main>
      <p>
        <Link href="/">&larr; Back</Link>
      </p>
      <h1>Transactions</h1>
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
                <td>{txn.category}</td>
                <td>{txn.pending ? 'yes' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
