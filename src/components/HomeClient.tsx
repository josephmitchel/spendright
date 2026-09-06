'use client';

import Link from 'next/link';
import PlaidLinkButton from '@/components/PlaidLinkButton';
import { useHomeData } from '@/components/useHomeData';
import { useItemRemoval } from '@/components/useItemRemoval';
import { useSyncAll } from '@/components/useSyncAll';
import { accountDisplayName, accountTypeLabel } from '@/lib/account-display';
import type { ApiItem } from '@/lib/api-types';
import { plaidErrorMessage } from '@/lib/plaid-errors';

// items.error is a picked Plaid error body or { message } (typed on the
// column); stringify is the fallback for a stored body with no usable text.
// Design: error-message-allow-list.
function itemErrorMessage(error: NonNullable<ApiItem['error']>): string {
  const fallback = JSON.stringify(error);
  return 'message' in error ? error.message || fallback : plaidErrorMessage(error, fallback);
}

// Thin view over the home hooks, mirroring the account page's shape.
export default function HomeClient() {
  const { itemList, accountList, settled, error, clearError, loaded, refresh, reload } =
    useHomeData();
  const { syncAll, syncing, syncStatus, syncSucceededAt } = useSyncAll(refresh);
  const { removeItem, removeError } = useItemRemoval(refresh);

  return (
    <main>
      <h1>SpendRight</h1>
      <p>
        <PlaidLinkButton onConnectedAction={refresh} syncSucceededAt={syncSucceededAt} />{' '}
        <button onClick={syncAll} disabled={syncing || (loaded.items && itemList.length === 0)}>
          Sync all
        </button>
        {syncStatus && <span> {syncStatus}</span>}
      </p>

      {!settled && <p>Loading…</p>}
      {error && (
        <p>
          Error: {error}{' '}
          <button
            onClick={() => {
              clearError();
              reload();
            }}
          >
            Retry
          </button>
        </p>
      )}
      {removeError && <p>Error: {removeError}</p>}
      {settled && loaded.items && itemList.length === 0 && <p>No institutions connected yet.</p>}
      {/* Above the per-institution sections, so a failed accounts read shows
          one line rather than one per institution. */}
      {itemList.length > 0 && !loaded.accounts && (
        <p>Accounts couldn&apos;t be loaded — use Retry above.</p>
      )}

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
            {loaded.accounts && (
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
                          {accountDisplayName(account)}
                        </Link>
                      </td>
                      <td>{account.mask}</td>
                      <td>{accountTypeLabel(account)}</td>
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
