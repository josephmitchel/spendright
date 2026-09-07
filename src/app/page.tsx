'use client';

import Link from 'next/link';
import { useCallback } from 'react';
import { ErrorNotice } from '@/components/ErrorNotice';
import { useVisiblePoll } from '@/hooks/useVisiblePoll';
import { accountDisplayName, accountTypeLabel } from '@/lib/account-display';
import { apiPaths } from '@/lib/api-paths';
import type { ApiAccount, ApiItem } from '@/lib/api-types';
import { itemErrorMessage } from '@/lib/item-error-message';
import { isPlaidItemError } from '@/lib/plaid-errors';
import { PlaidLinkButton } from './PlaidLinkButton';
import { RepairConnectionButton } from './RepairConnectionButton';
import { useHomeData } from './useHomeData';
import { useItemRemoval } from './useItemRemoval';
import { useSyncAll } from './useSyncAll';

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
          <th scope="col">Account</th>
          <th scope="col">Mask</th>
          <th scope="col">Type</th>
          <th scope="col">Current</th>
          <th scope="col">Available</th>
          <th scope="col">Limit</th>
          <th scope="col">Updated</th>
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
            {/* The freshness cue for a balance about to inform a spending decision. */}
            <td>{new Date(account.updatedAt).toLocaleString()}</td>
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
  removePending,
  onRemoveAction,
  onRepairedAction,
}: {
  item: ApiItem;
  accounts: ApiAccount[];
  accountsLoaded: boolean;
  removePending: boolean;
  onRemoveAction: (itemId: string) => void;
  onRepairedAction: () => void;
}) {
  return (
    <section>
      <h2>
        {item.hasLogo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={apiPaths.itemLogo(item.itemId)} alt="" width={24} height={24} />
        )}{' '}
        {item.institutionName ?? item.itemId}{' '}
        <button onClick={() => onRemoveAction(item.itemId)} disabled={removePending}>
          Remove
        </button>
        {/* Design: async-status-announced — wrapper must stay mounted. */}
        <span role="status">{removePending ? ' Removing…' : null}</span>
      </h2>
      {item.error != null && (
        <p>
          <ErrorNotice inline error={itemErrorMessage(item.error)} />{' '}
          {/* Design: connection-repair-update-mode. */}
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
  const { itemList, accountList, lastSync, settled, error, loaded, refresh, retry } = useHomeData();
  const { syncAll, syncing, syncStatus, syncError, syncSucceededAt } = useSyncAll(refresh);
  const { removeItem, removing, removeError } = useItemRemoval(refresh);

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
      {lastSync && (
        <p>Last automatic sync finished {new Date(lastSync.finishedAt).toLocaleString()}.</p>
      )}

      {/* Design: async-status-announced — wrapper must stay mounted. */}
      <p role="status">{view === 'loading' ? 'Loading…' : null}</p>
      {error && <ErrorNotice error={error} onRetryAction={retry} />}
      {lastSync?.error != null && (
        <ErrorNotice error={`The last automatic sync failed: ${lastSync.error}`} />
      )}
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
              removePending={removing}
              onRemoveAction={removeItem}
              onRepairedAction={syncAll}
            />
          ))}
        </>
      )}
    </main>
  );
}
