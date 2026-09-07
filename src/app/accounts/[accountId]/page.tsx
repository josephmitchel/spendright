'use client';

import Link from 'next/link';
import { use, useCallback, useEffect } from 'react';
import { ErrorNotice } from '@/components/ErrorNotice';
import { combineLoadStates } from '@/hooks/useLoadProtocol';
import { useVisiblePoll } from '@/hooks/useVisiblePoll';
import { accountDisplayName, accountTypeLabel } from '@/lib/account-display';
import type { ApiAccount } from '@/lib/api-types';
import { PAGE_SIZE } from '@/lib/pagination';
import { TransactionTable } from './TransactionTable';
import { useAccountData } from './useAccountData';
import { useCategoryPatches } from './useCategoryPatches';
import { useTransactionPage } from './useTransactionPage';

// Design: supported-account-rule, selections-are-user-owned,
// categorization-is-a-historical-snapshot.

export default function AccountPage({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = use(params);
  // Keyed so switching accounts remounts instead of showing stale state.
  return <AccountView key={accountId} accountId={accountId} />;
}

// The page body renders exactly one of these; deriveView enumerates the
// legal states once.
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
  // Not-found needs positive evidence: this pass's account read succeeded
  // and found nothing. Design: partial-load-rendering.
  if (accountLoaded && !account) return 'not-found';
  // Unsupported needs both reads current, because the card is only
  // recomputed when both succeeded. Design: supported-account-rule.
  if (accountLoaded && cardsLoaded && account && !hasCard) return 'unsupported';
  // Ready renders the (possibly stale) card content; failures show beside it.
  if (hasCard) return 'ready';
  return 'unresolved';
}

// The identity line under the heading.
function AccountIdentity({ account }: { account: ApiAccount }) {
  return (
    <p>
      {account.officialName && account.officialName !== account.name
        ? `${account.officialName} — `
        : ''}
      {account.mask ? `••${account.mask} — ` : ''}
      {accountTypeLabel(account)}
      {' — current: '}
      {account.balanceCurrent ?? '—'}
      {', available: '}
      {account.balanceAvailable ?? '—'}
      {account.balanceLimit != null ? `, limit: ${account.balanceLimit}` : ''}
      {account.isoCurrencyCode ? ` ${account.isoCurrencyCode}` : ''}
    </p>
  );
}

// Shown even for a single page, so "1–17 of 17" answers "is this all?".
// Range and buttons are based on shownPage, the rows actually on screen.
// Design: pager-keeps-stale-rows.
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
      {pageLoading && <span> Loading…</span>}
    </p>
  );
}

function AccountView({ accountId }: { accountId: string }) {
  const accountData = useAccountData(accountId);
  const transactionPage = useTransactionPage(accountId);
  const { account, card, creditCategories, refresh: refreshAccount } = accountData;
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
  );

  // Turning the pager clears patch failures, so a long-gone edit's failure
  // can't resurface on a later visit. Design: optimistic-category-writes.
  useEffect(() => {
    clearPatchErrors();
  }, [shownPage, clearPatchErrors]);

  // The two loads as one lifecycle: settled together, errors joined, one Retry.
  const { settled, error, retry } = combineLoadStates([accountData, transactionPage]);

  // Silent poll so background sync changes show up without a reload.
  // Design: home-reflects-background-sync.
  useVisiblePoll(
    useCallback(() => {
      void refreshAccount();
      void refreshTransactions();
    }, [refreshAccount, refreshTransactions]),
  );

  // Design: stale-lists-disable-editing.
  const categoriesMayBeStale = !accountData.loaded.cards || !accountData.loaded.account;

  const view = deriveView({
    // The first load only; over once both loads have settled.
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
      {view === 'loading' && <p>Loading…</p>}
      {error && <ErrorNotice error={error} onRetryAction={retry} />}
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
      {/* card is non-null whenever view is 'ready'; the check is for the compiler. */}
      {view === 'ready' && card && (
        <>
          <p>{`Card: ${card.name} (${card.type})`}</p>
          <h2>Transactions</h2>
          {categoriesMayBeStale && (
            <p>Category lists may be out of date — editing is off until they refresh.</p>
          )}
          {/* total is the account's own count, so this can't fire on a page past the end. */}
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
