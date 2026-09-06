'use client';

import Link from 'next/link';
import { use, useState } from 'react';
import { TransactionTable } from './TransactionTable';
import { useAccountData } from './useAccountData';
import { useCategoryPatches } from './useCategoryPatches';
import { PAGE_SIZE, useTransactionPage } from './useTransactionPage';

// Design: supported-account-rule, selections-are-user-owned,
// categorization-is-a-historical-snapshot.

export default function AccountPage({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = use(params);
  // Keyed so switching accounts remounts instead of showing stale state.
  return <AccountView key={accountId} accountId={accountId} />;
}

function AccountView({ accountId }: { accountId: string }) {
  // Bumped by Retry (and by a same-page reload) to re-run both load effects.
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey((key) => key + 1);

  const {
    account,
    card,
    creditCategories,
    settled: accountSettled,
    error: accountError,
    clearError: clearAccountError,
    loaded,
  } = useAccountData(accountId, reloadKey);
  const {
    transactionList,
    setTransactionList,
    total,
    pageLoading,
    shownPage,
    settled: transactionsSettled,
    error: transactionsError,
    clearError: clearTransactionsError,
    loaded: transactionsLoaded,
    goToPage,
  } = useTransactionPage(accountId, reloadKey, reload);
  const { setCategory, patchError } = useCategoryPatches(
    card,
    creditCategories,
    setTransactionList,
  );

  // `loading` covers the first load only, and ends once both loads have settled.
  const loading = !accountSettled || !transactionsSettled;
  // One error slice per load, since the two settle independently.
  const error = [accountError, transactionsError].filter(Boolean).join('; ') || null;
  // Design: stale-lists-disable-editing.
  const categoriesMayBeStale = !loaded.cards || !loaded.account;

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
      {loading && <p>Loading…</p>}
      {error && (
        <p>
          Error: {error}{' '}
          <button
            onClick={() => {
              clearAccountError();
              clearTransactionsError();
              reload();
            }}
          >
            Retry
          </button>
        </p>
      )}
      {!loading && loaded.account && !account && (
        <p>Account not found. It may have been disconnected — check the list on the home page.</p>
      )}
      {/* Unsupported account: identity and balances only. Gated on both reads
          because the card is only recomputed when both succeeded. */}
      {!loading && account && loaded.account && loaded.cards && !card && (
        <p>
          <strong>Card not supported.</strong> This account doesn&apos;t match any card definition,
          so SpendRight can&apos;t show or categorize its transactions. Add its Plaid account name
          to the right card in <code>src/db/cards.seed.ts</code> and re-run{' '}
          <code>npm run seed:cards</code>.
        </p>
      )}
      {!loading && card && (
        <>
          <p>{`Card: ${card.name} (${card.type})`}</p>
          <h2>Transactions</h2>
          {categoriesMayBeStale && (
            <p>Category lists may be out of date — editing is off until they refresh.</p>
          )}
          {patchError && <p>Category update failed: {patchError}</p>}
          {/* total is the account's own count, so this can't fire on a page past the end. */}
          {transactionsLoaded && total === 0 && <p>No transactions.</p>}
          {transactionList.length > 0 && (
            <TransactionTable
              card={card}
              creditCategories={creditCategories}
              transactionList={transactionList}
              categoriesMayBeStale={categoriesMayBeStale}
              onSelectCategory={setCategory}
            />
          )}
          {/* Shown even for a single page, so "1–17 of 17" answers "is this all?".
              Range and buttons are based on shownPage, the rows actually on screen. */}
          {total !== null && total > 0 && transactionList.length > 0 && (
            <p>
              Showing {shownPage * PAGE_SIZE + 1}–{shownPage * PAGE_SIZE + transactionList.length}{' '}
              of {total}{' '}
              <button
                onClick={() => goToPage(shownPage - 1)}
                disabled={shownPage === 0 || pageLoading}
              >
                Previous
              </button>{' '}
              <button
                onClick={() => goToPage(shownPage + 1)}
                disabled={(shownPage + 1) * PAGE_SIZE >= total || pageLoading}
              >
                Next
              </button>
              {pageLoading && <span> Loading…</span>}
            </p>
          )}
        </>
      )}
    </main>
  );
}
