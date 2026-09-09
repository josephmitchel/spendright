'use client';

import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';
import { ErrorNotice } from '@/components/ErrorNotice';
import { combineLoadStates } from '@/hooks/useLoadProtocol';
import { useVisiblePoll } from '@/hooks/useVisiblePoll';
import { accountDisplayName, accountTypeLabel } from '@/lib/account-display';
import type { ApiAccount } from '@/lib/api-types';
import { itemErrorMessage } from '@/lib/item-error-message';
import { formatMoney, rowCurrency } from '@/lib/money';
import { PAGE_SIZE } from '@/lib/pagination';
import { CategoryWriteState } from './category-write-state';
import { CATEGORY_STALE_NOTICE_ID, TransactionTable } from './TransactionTable';
import { useAccountData } from './useAccountData';
import { useCategoryPatches } from './useCategoryPatches';
import { useTransactionPage } from './useTransactionPage';

export default function AccountPage({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = use(params);
  return <AccountView key={accountId} accountId={accountId} />;
}

type View = 'loading' | 'not-found' | 'unsupported' | 'ready' | 'unresolved';

function deriveView(inputs: {
  loading: boolean;
  accountLoaded: boolean;
  cardsLoaded: boolean;
  account: ApiAccount | null;
  hasCard: boolean;
}): View {
  const { loading, accountLoaded, cardsLoaded, account, hasCard } = inputs;
  if (loading) return 'loading';
  if (accountLoaded && !account) return 'not-found';
  if (accountLoaded && cardsLoaded && account && !hasCard) return 'unsupported';
  if (hasCard) return 'ready';
  return 'unresolved';
}

function AccountIdentity({ account }: { account: ApiAccount }) {
  const currency = rowCurrency(account);
  return (
    <p>
      {account.officialName && account.officialName !== account.name
        ? `${account.officialName} — `
        : ''}
      {account.mask ? `••${account.mask} — ` : ''}
      {accountTypeLabel(account)}
      {' — current: '}
      {formatMoney(account.balanceCurrent, currency)}
      {', available: '}
      {formatMoney(account.balanceAvailable, currency)}
      {account.balanceLimit != null
        ? `, limit: ${formatMoney(account.balanceLimit, currency)}`
        : ''}
      {` — updated ${new Date(account.updatedAt).toLocaleString()}`}
    </p>
  );
}

function Pager({
  shownPage,
  shownCount,
  total,
  pageLoading,
  goToPage,
}: {
  shownPage: number;
  shownCount: number;
  total: number;
  pageLoading: boolean;
  goToPage: (next: number) => void;
}) {
  const rangeStart = shownPage * PAGE_SIZE + 1;
  const rangeEnd = shownPage * PAGE_SIZE + shownCount;
  const onLastPage = (shownPage + 1) * PAGE_SIZE >= total;
  return (
    <p>
      Showing {rangeStart}–{rangeEnd} of {total}{' '}
      <button onClick={() => goToPage(shownPage - 1)} disabled={shownPage === 0 || pageLoading}>
        Previous
      </button>{' '}
      <button onClick={() => goToPage(shownPage + 1)} disabled={onLastPage || pageLoading}>
        Next
      </button>
      {/* Wrapper must stay mounted. */}
      <span role="status">{pageLoading ? ' Loading…' : null}</span>
    </p>
  );
}

function AccountView({ accountId }: { accountId: string }) {
  const accountData = useAccountData(accountId);
  const [categoryWrites] = useState(() => new CategoryWriteState());
  const transactionPage = useTransactionPage(accountId, categoryWrites);
  const { account, itemError, card, creditCategories, refresh: refreshAccount } = accountData;
  const {
    transactionList,
    total,
    pageLoading,
    shownPage,
    goToPage,
    refresh: refreshTransactions,
  } = transactionPage;
  const { setCategory, patchErrors, clearPatchErrors } = useCategoryPatches(
    card,
    creditCategories,
    transactionPage.applyCategoryPatch,
    categoryWrites,
  );

  useEffect(() => {
    clearPatchErrors();
  }, [shownPage, clearPatchErrors]);

  const { settled, error, retry, reloading } = combineLoadStates([accountData, transactionPage]);

  useVisiblePoll(
    useCallback(() => {
      void refreshAccount();
      void refreshTransactions();
    }, [refreshAccount, refreshTransactions]),
  );

  // A 'use client' page can't export route metadata, so the tab title (the cue
  // that tells account tabs and history entries apart) is set here.
  useEffect(() => {
    if (!account) return;
    document.title = `${accountDisplayName(account)} — SpendRight`;
    return () => {
      document.title = 'SpendRight';
    };
  }, [account]);

  // `fresh`, not `loaded`: the sticky loaded flags never revert, so they can't
  // gate write safety — a failed poll must re-disable the pickers.
  const categoriesMayBeStale = !accountData.fresh.cards || !accountData.fresh.account;

  const view = deriveView({
    loading: !settled,
    accountLoaded: accountData.loaded.account,
    cardsLoaded: accountData.loaded.cards,
    account,
    hasCard: card !== null,
  });

  return (
    <main>
      <p>
        <Link href="/">&larr; Back</Link>
      </p>
      <h1>{account ? accountDisplayName(account) : 'Account'}</h1>
      {account && <AccountIdentity account={account} />}
      {/* The owning item's warning must reach this page too — it's the one a
          user checks before spending. */}
      {itemError != null && <ErrorNotice error={itemErrorMessage(itemError)} />}
      {/* Wrapper must stay mounted. */}
      <p role="status">{view === 'loading' ? 'Loading…' : null}</p>
      {error && <ErrorNotice error={error} onRetryAction={retry} retryPending={reloading} />}
      {view === 'not-found' && (
        <p>Account not found. It may have been disconnected — check the list on the home page.</p>
      )}
      {view === 'unsupported' && (
        <p>
          <strong>Card not supported.</strong> This account doesn&apos;t match any card definition,
          so SpendRight can&apos;t show or categorize its transactions. Add its Plaid account name
          to the right card in <code>src/db/cards.seed.ts</code> and re-run{' '}
          <code>npm run seed:cards</code>.
        </p>
      )}
      {view === 'ready' && card && (
        <>
          <p>{`Card: ${card.name} (${card.type})`}</p>
          <h2>Transactions</h2>
          {categoriesMayBeStale && (
            <p id={CATEGORY_STALE_NOTICE_ID}>
              Category lists may be out of date — editing is off until they refresh.
            </p>
          )}
          {transactionPage.loaded.transactions && total === 0 && <p>No transactions.</p>}
          {transactionList.length > 0 && (
            <TransactionTable
              card={card}
              creditCategories={creditCategories}
              transactionList={transactionList}
              categoriesMayBeStale={categoriesMayBeStale}
              patchErrors={patchErrors}
              onSelectCategoryAction={setCategory}
            />
          )}
          {total !== null && total > 0 && transactionList.length > 0 && (
            <Pager
              shownPage={shownPage}
              shownCount={transactionList.length}
              total={total}
              pageLoading={pageLoading}
              goToPage={goToPage}
            />
          )}
        </>
      )}
    </main>
  );
}
