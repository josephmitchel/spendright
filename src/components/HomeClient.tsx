'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import PlaidLinkButton from '@/components/PlaidLinkButton';

interface Item {
  itemId: string;
  institutionName: string | null;
  institutionLogo: string | null;
  error: unknown;
}

interface Account {
  accountId: string;
  itemId: string;
  name: string | null;
  officialName: string | null;
  mask: string | null;
  type: string | null;
  subtype: string | null;
  balanceAvailable: string | null;
  balanceCurrent: string | null;
  balanceLimit: string | null;
  isoCurrencyCode: string | null;
}

export default function HomeClient() {
  const [itemList, setItemList] = useState<Item[]>([]);
  const [accountList, setAccountList] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [itemsRes, accountsRes] = await Promise.all([
        fetch('/api/items'),
        fetch('/api/accounts'),
      ]);
      const itemsData = await itemsRes.json();
      const accountsData = await accountsRes.json();
      setItemList(itemsData.items ?? []);
      setAccountList(accountsData.accounts ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const syncAll = async () => {
    setSyncStatus('Syncing…');
    try {
      const res = await fetch('/api/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || 'Sync failed');
      const parts = (data.results ?? []).map(
        (r: { itemId: string; added?: number; error?: string }) =>
          r.error ? `${r.itemId}: ${r.error}` : `+${r.added} added`,
      );
      setSyncStatus(`Sync complete. ${parts.join(', ') || 'No items.'}`);
      refresh();
    } catch (err) {
      setSyncStatus(`Sync failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  };

  const removeItem = async (itemId: string) => {
    if (!confirm('Remove this institution and all of its accounts and transactions?')) return;
    const res = await fetch(`/api/items/${itemId}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      alert(data?.error?.message || 'Failed to remove item');
      return;
    }
    refresh();
  };

  return (
    <main>
      <h1>SpendRight</h1>
      <p>
        <PlaidLinkButton onConnected={refresh} />{' '}
        <button onClick={syncAll} disabled={itemList.length === 0}>
          Sync all
        </button>
        {syncStatus && <span> {syncStatus}</span>}
      </p>

      {loading && <p>Loading…</p>}
      {!loading && itemList.length === 0 && <p>No institutions connected yet.</p>}

      {itemList.map((item) => {
        const itemAccounts = accountList.filter((a) => a.itemId === item.itemId);
        return (
          <section key={item.itemId}>
            <h2>
              {item.institutionLogo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`data:image/png;base64,${item.institutionLogo}`}
                  alt=""
                  width={24}
                  height={24}
                />
              )}{' '}
              {item.institutionName ?? item.itemId}{' '}
              <button onClick={() => removeItem(item.itemId)}>Remove</button>
            </h2>
            {item.error != null && <p>Item error: {JSON.stringify(item.error)}</p>}
            <table border={1}>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Mask</th>
                  <th>Type</th>
                  <th>Current</th>
                  <th>Available</th>
                  <th>Limit</th>
                </tr>
              </thead>
              <tbody>
                {itemAccounts.map((account) => (
                  <tr key={account.accountId}>
                    <td>
                      <Link href={`/accounts/${account.accountId}`}>
                        {account.name ?? account.officialName ?? account.accountId}
                      </Link>
                    </td>
                    <td>{account.mask}</td>
                    <td>
                      {account.type}
                      {account.subtype ? ` / ${account.subtype}` : ''}
                    </td>
                    <td>{account.balanceCurrent}</td>
                    <td>{account.balanceAvailable}</td>
                    <td>{account.balanceLimit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </main>
  );
}
