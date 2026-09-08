'use client';

import Link from 'next/link';
import { useCallback } from 'react';
import { ErrorNotice } from '@/components/ErrorNotice';
import { useVisiblePoll } from '@/hooks/useVisiblePoll';
import { accountDisplayName, accountTypeLabel } from '@/lib/account-display';
import { apiPaths } from '@/lib/api-paths';
import type { ApiAccount, ApiItem } from '@/lib/api-types';
import { itemErrorMessage } from '@/lib/item-error-message';
import { formatMoney, rowCurrency } from '@/lib/money';
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
          <th scope="col">Currency</th>
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
            <td>{formatMoney(account.balanceCurrent, rowCurrency(account))}</td>
            <td>{formatMoney(account.balanceAvailable, rowCurrency(account))}</td>
            <td>{formatMoney(account.balanceLimit, rowCurrency(account))}</td>
            <td>{rowCurrency(account)}</td>
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
  removeError,
  onRemoveAction,
  onRepairedAction,
}: {
  item: ApiItem;
  accounts: ApiAccount[];
  accountsLoaded: boolean;
  removePending: boolean;
  removeError: string | null;
  onRemoveAction: (itemId: string, institutionName: string) => void;
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
        <button
          onClick={() => onRemoveAction(item.itemId, item.institutionName ?? item.itemId)}
          disabled={removePending}
        >
          Remove
        </button>
        {/* Wrapper must stay mounted. */}
        <span role="status">{removePending ? ' Removing…' : null}</span>
        {removeError != null && <ErrorNotice inline error={removeError} />}
      </h2>
      {item.error != null && (
        <p>
          <ErrorNotice inline error={itemErrorMessage(item.error)} />{' '}
          {isPlaidItemError(item.error) && (
            <RepairConnectionButton itemId={item.itemId} onRepairedAction={onRepairedAction} />
          )}
        </p>
      )}
      {accountsLoaded && <AccountsTable accounts={accounts} />}
    </section>
  );
}

export default function Home() {
  const { itemList, accountList, lastSync, settled, error, loaded, refresh, retry, reloading } =
    useHomeData();
  const { syncAll, syncing, syncStatus, syncError, syncSucceededAt } = useSyncAll(refresh);
  const { removeItem, removingItems, removeErrors } = useItemRemoval(refresh);

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
        {/* Wrapper must stay mounted. */}
        <span role="status">{syncStatus ? ` ${syncStatus}` : null}</span>
      </p>
      {lastSync && (
        <p>
          Last {lastSync.trigger === 'manual' ? 'manual' : 'automatic'} sync finished{' '}
          {new Date(lastSync.finishedAt).toLocaleString()}.
        </p>
      )}

      {/* Wrapper must stay mounted. */}
      <p role="status">{view === 'loading' ? 'Loading…' : null}</p>
      {error && <ErrorNotice error={error} onRetryAction={retry} retryPending={reloading} />}
      {lastSync?.error != null && (
        <ErrorNotice
          error={`The last ${
            lastSync.trigger === 'manual' ? 'manual' : 'automatic'
          } sync failed: ${lastSync.error}`}
        />
      )}
      {syncError && <ErrorNotice error={syncError} />}
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
              removePending={removingItems.has(item.itemId)}
              removeError={removeErrors.get(item.itemId) ?? null}
              onRemoveAction={removeItem}
              onRepairedAction={syncAll}
            />
          ))}
        </>
      )}
    </main>
  );
}
