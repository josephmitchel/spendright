'use client';

import Link from 'next/link';
import { useCallback } from 'react';
import { ErrorNotice } from '@/components/ErrorNotice';
import { useVisiblePoll } from '@/hooks/useVisiblePoll';
import { accountDisplayName, accountTypeLabel } from '@/lib/account-display';
import type { ApiAccount, ApiItem } from '@/lib/api-types';
import { isPlaidItemError, plaidErrorMessage } from '@/lib/plaid-errors';
import { PlaidLinkButton } from './PlaidLinkButton';
import { RepairConnectionButton } from './RepairConnectionButton';
import { useHomeData } from './useHomeData';
import { useItemRemoval } from './useItemRemoval';
import { useSyncAll } from './useSyncAll';

// Design: error-message-allow-list.
function itemErrorMessage(error: NonNullable<ApiItem['error']>): string {
  const fallback = JSON.stringify(error);
  return isPlaidItemError(error) ? plaidErrorMessage(error, fallback) : error.message || fallback;
}

type View = 'loading' | 'no-institutions' | 'list' | 'unresolved';

function deriveView(inputs: { loading: boolean; itemsLoaded: boolean; itemCount: number }): View {
  const { loading, itemsLoaded, itemCount } = inputs;
  if (loading) return 'loading';
  // Design: partial-load-rendering.
  if (itemsLoaded && itemCount === 0) return 'no-institutions';
  if (itemCount > 0) return 'list';
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
  onRepairedAction,
}: {
  item: ApiItem;
  accounts: ApiAccount[];
  accountsLoaded: boolean;
  onRemoveAction: (itemId: string) => void;
  onRepairedAction: () => void;
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
      {item.error != null && (
        <p>
          Item error: {itemErrorMessage(item.error)} {/* Design: connection-repair-update-mode. */}
          {isPlaidItemError(item.error) && (
            <RepairConnectionButton itemId={item.itemId} onRepairedAction={onRepairedAction} />
          )}
        </p>
      )}
      {accountsLoaded && <AccountsTable accounts={accounts} />}
    </section>
  );
}

// Design: client-pages-fetch-api.
export default function Home() {
  const { itemList, accountList, settled, error, loaded, refresh, retry } = useHomeData();
  const { syncAll, syncing, syncStatus, syncError, syncSucceededAt } = useSyncAll(refresh);
  const { removeItem, removeError } = useItemRemoval(refresh);

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
        <button onClick={syncAll} disabled={syncing || view === 'no-institutions'}>
          Sync all
        </button>
        {/* Design: async-status-announced — wrapper must stay mounted. */}
        <span role="status">{syncStatus ? ` ${syncStatus}` : null}</span>
      </p>

      {view === 'loading' && <p>Loading…</p>}
      {error && <ErrorNotice error={error} onRetryAction={retry} />}
      {syncError && <ErrorNotice error={syncError} />}
      {removeError && <ErrorNotice error={removeError} />}
      {view === 'no-institutions' && <p>No institutions connected yet.</p>}
      {view === 'list' && (
        <>
          {!loaded.accounts && <p>Accounts couldn&apos;t be loaded — use Retry above.</p>}
          {itemList.map((item) => (
            <InstitutionSection
              key={item.itemId}
              item={item}
              accounts={accountList.filter((account) => account.itemId === item.itemId)}
              accountsLoaded={loaded.accounts}
              onRemoveAction={removeItem}
              onRepairedAction={syncAll}
            />
          ))}
        </>
      )}
    </main>
  );
}
