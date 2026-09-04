'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import PlaidLinkButton from '@/components/PlaidLinkButton';
import { readJson } from '@/lib/http';

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

// items.error is either a Plaid error body or { message }; stringify is the
// fallback for an unrecognized shape.
function itemErrorMessage(error: unknown): string {
  const body = error as {
    display_message?: string | null;
    error_message?: string;
    message?: string;
  };
  return body?.display_message || body?.error_message || body?.message || JSON.stringify(error);
}

export default function HomeClient() {
  const [itemList, setItemList] = useState<Item[]>([]);
  const [accountList, setAccountList] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  // Guards against a second concurrent POST /api/sync.
  const [syncing, setSyncing] = useState(false);
  // When "Sync all" last came back with every item clean; PlaidLinkButton uses
  // it to expire its connect-time notice.
  const [syncSucceededAt, setSyncSucceededAt] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Whether /api/items succeeded; gates the "No institutions" message.
  const [itemsLoaded, setItemsLoaded] = useState(false);
  // Whether /api/accounts has ever succeeded; gates the per-institution
  // account tables so a failed read never renders as an empty account list.
  // Design: partial-load-rendering.
  const [accountsLoaded, setAccountsLoaded] = useState(false);

  // Generation counter: a refresh superseded by a later one writes nothing.
  const refreshSeq = useRef(0);
  const refresh = useCallback(async () => {
    const seq = ++refreshSeq.current;
    // Design: partial-load-rendering — each endpoint settles on its own.
    const [itemsResult, accountsResult] = await Promise.allSettled([
      fetch('/api/items').then((res) => readJson(res, 'Failed to load institutions')),
      fetch('/api/accounts').then((res) => readJson(res, 'Failed to load accounts')),
    ]);
    if (seq !== refreshSeq.current) return;
    if (itemsResult.status === 'fulfilled') setItemList(itemsResult.value.items ?? []);
    if (accountsResult.status === 'fulfilled') {
      setAccountList(accountsResult.value.accounts ?? []);
      // Sticky: a later failed refresh keeps rendering the rows that did load.
      setAccountsLoaded(true);
    }
    setItemsLoaded(itemsResult.status === 'fulfilled');
    const failures = [itemsResult, accountsResult].filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    for (const failure of failures) console.error(failure.reason);
    setLoadError(
      failures.length > 0
        ? failures
            .map((f) => (f.reason instanceof Error ? f.reason.message : 'Failed to load'))
            .join('; ')
        : null,
    );
    setLoading(false);
  }, []);

  // Wrapped so react-hooks/set-state-in-effect can see the async boundary.
  useEffect(() => {
    void (async () => {
      await refresh();
    })();
  }, [refresh]);

  const syncAll = async () => {
    setSyncing(true);
    setSyncStatus('Syncing…');
    try {
      const res = await fetch('/api/sync', { method: 'POST' });
      const data = await readJson(res, 'Sync failed');
      const results: {
        itemId: string;
        added?: number;
        skipped?: number;
        dropped?: boolean;
        error?: string;
      }[] = data.results ?? [];
      // `skipped` rows were held back (cursor not advanced) unless `dropped`,
      // in which case the sync gave up on them. Design: bounded-cursor-hold.
      const parts = results.map((r) =>
        r.error
          ? `${r.itemId}: ${r.error}`
          : `+${r.added} added${
              r.skipped
                ? r.dropped
                  ? `, ${r.skipped} dropped after repeated failures — not recoverable (see the server log)`
                  : `, ${r.skipped} skipped — will retry next sync (see the server log)`
                : ''
            }`,
      );
      setSyncStatus(`Sync complete. ${parts.join(', ') || 'No items.'}`);
      // Clean means every item finished with no error and no held/dropped rows.
      if (results.length > 0 && results.every((r) => !r.error && !r.skipped))
        setSyncSucceededAt(Date.now());
      refresh();
    } catch (err) {
      setSyncStatus(`Sync failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      // Released when the POST settles; the refresh above is not awaited.
      setSyncing(false);
    }
  };

  const removeItem = async (itemId: string) => {
    if (!confirm('Remove this institution and all of its accounts and transactions?')) return;
    try {
      const res = await fetch(`/api/items/${encodeURIComponent(itemId)}`, { method: 'DELETE' });
      await readJson(res, 'Failed to remove item');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to remove item');
      return;
    }
    refresh();
  };

  return (
    <main>
      <h1>SpendRight</h1>
      <p>
        <PlaidLinkButton onConnected={refresh} syncSucceededAt={syncSucceededAt} />{' '}
        <button onClick={syncAll} disabled={syncing || itemList.length === 0}>
          Sync all
        </button>
        {syncStatus && <span> {syncStatus}</span>}
      </p>

      {loading && <p>Loading…</p>}
      {loadError && (
        <p>
          Error: {loadError}{' '}
          <button
            onClick={() => {
              setLoadError(null);
              refresh();
            }}
          >
            Retry
          </button>
        </p>
      )}
      {!loading && itemsLoaded && itemList.length === 0 && <p>No institutions connected yet.</p>}

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
            {item.error != null && <p>Item error: {itemErrorMessage(item.error)}</p>}
            {!accountsLoaded && <p>Accounts couldn&apos;t be loaded — use Retry above.</p>}
            {accountsLoaded && (
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
            )}
          </section>
        );
      })}
    </main>
  );
}
