'use client';

import Link from 'next/link';
import { useCallback } from 'react';
import { ErrorNotice } from '@/components/ErrorNotice';
import { useVisiblePoll } from '@/hooks/useVisiblePoll';
import { accountDisplayName, accountTypeLabel } from '@/lib/account-display';
import type { ApiAccount, ApiItem } from '@/lib/api-types';
import { plaidErrorMessage } from '@/lib/plaid-errors';
import { PlaidLinkButton } from './PlaidLinkButton';
import { useHomeData } from './useHomeData';
import { useItemRemoval } from './useItemRemoval';
import { useSyncAll } from './useSyncAll';

// items.error is a picked Plaid error body or { message }; stringify is the
// fallback for a stored body with no usable text.
// Design: error-message-allow-list.
function itemErrorMessage(error: NonNullable<ApiItem['error']>): string {
  const fallback = JSON.stringify(error);
  return 'message' in error ? error.message || fallback : plaidErrorMessage(error, fallback);
}

// deriveView enumerates the page body's legal states once; 'unresolved'
// renders nothing beyond the error line.
type View = 'loading' | 'no-institutions' | 'list' | 'unresolved';

function deriveView(inputs: { loading: boolean; itemsLoaded: boolean; itemCount: number }): View {
  const { loading, itemsLoaded, itemCount } = inputs;
  if (loading) return 'loading';
  // The empty-state claim needs positive evidence: this pass's items read
  // succeeded and found none. Design: partial-load-rendering.
  if (itemsLoaded && itemCount === 0) return 'no-institutions';
  if (itemCount > 0) return 'list';
  // The items read failed and nothing is on screen.
  return 'unresolved';
}

function AccountsTable({ accounts }: { accounts: ApiAccount[] }) {
  return (
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
        {accounts.map((account) => (
          <tr key={account.accountId}>
            <td>
              <Link href={`/accounts/${account.accountId}`}>{accountDisplayName(account)}</Link>
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
  );
}

function InstitutionSection({
  item,
  accounts,
  accountsLoaded,
  onRemoveAction,
}: {
  item: ApiItem;
  accounts: ApiAccount[];
  accountsLoaded: boolean;
  onRemoveAction: (itemId: string) => void;
}) {
  return (
    <section>
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
        <button onClick={() => onRemoveAction(item.itemId)}>Remove</button>
      </h2>
      {item.error != null && <p>Item error: {itemErrorMessage(item.error)}</p>}
      {accountsLoaded && <AccountsTable accounts={accounts} />}
    </section>
  );
}

// Design: client-pages-fetch-api.
export default function Home() {
  const { itemList, accountList, settled, error, loaded, refresh, retry } = useHomeData();
  const { syncAll, syncing, syncStatus, syncError, syncSucceededAt } = useSyncAll(refresh);
  const { removeItem, removeError } = useItemRemoval(refresh);

  // Silent poll so background sync changes show up without a reload.
  // Design: home-reflects-background-sync.
  useVisiblePoll(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const view = deriveView({
    loading: !settled,
    itemsLoaded: loaded.items,
    itemCount: itemList.length,
  });

  return (
    <main>
      <h1>SpendRight</h1>
      <p>
        <PlaidLinkButton
          onConnectedAction={() => void refresh()}
          syncSucceededAt={syncSucceededAt}
        />{' '}
        {/* Nothing to sync exactly when the empty state is showing. */}
        <button onClick={syncAll} disabled={syncing || view === 'no-institutions'}>
          Sync all
        </button>
        {syncStatus && <span> {syncStatus}</span>}
      </p>

      {view === 'loading' && <p>Loading…</p>}
      {error && <ErrorNotice error={error} onRetryAction={retry} />}
      {/* No Retry on either: the Sync all / Remove button is its own retry. */}
      {syncError && <ErrorNotice error={syncError} />}
      {removeError && <ErrorNotice error={removeError} />}
      {view === 'no-institutions' && <p>No institutions connected yet.</p>}
      {view === 'list' && (
        <>
          {/* One line above the sections, not one per institution. */}
          {!loaded.accounts && <p>Accounts couldn&apos;t be loaded — use Retry above.</p>}
          {itemList.map((item) => (
            <InstitutionSection
              key={item.itemId}
              item={item}
              accounts={accountList.filter((account) => account.itemId === item.itemId)}
              accountsLoaded={loaded.accounts}
              onRemoveAction={removeItem}
            />
          ))}
        </>
      )}
    </main>
  );
}
