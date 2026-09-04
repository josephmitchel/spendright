'use client';

import Link from 'next/link';
import { use, useEffect, useRef, useState } from 'react';
import { isInflowAmount } from '@/lib/amounts';
import { readJson } from '@/lib/http';

// Design: supported-account-rule, selections-are-user-owned,
// categorization-is-a-historical-snapshot.

// Rows per page; always sent explicitly rather than relying on the API default.
const PAGE_SIZE = 20;

interface Transaction {
  transactionId: string;
  date: string;
  name: string | null;
  merchantName: string | null;
  amount: string;
  isoCurrencyCode: string | null;
  category: string | null;
  pending: boolean | null;
  cardCategoryId: number | null;
  rewardRate: string | null;
  cardCategoryName: string | null;
  creditCategoryId: number | null;
  creditCategoryName: string | null;
}

interface Account {
  accountId: string;
  name: string | null;
  officialName: string | null;
  mask: string | null;
  type: string | null;
  subtype: string | null;
  balanceAvailable: string | null;
  balanceCurrent: string | null;
  balanceLimit: string | null;
  isoCurrencyCode: string | null;
  cardId: number | null;
}

interface CardCategory {
  id: number;
  cardId: number;
  name: string;
  rate: string;
}

interface Card {
  id: number;
  slug: string;
  name: string;
  issuer: string | null;
  type: 'cashback' | 'points';
  categories: CardCategory[];
}

// Global inflow categories (negative amounts): payments, refunds, rewards.
interface CreditCategory {
  id: number;
  name: string;
}

// One picker for both category kinds. Placeholders are disabled+hidden: a
// transaction keeps a category once one is assigned (design: no-category-clear).
function CategorySelect({
  value,
  valueName,
  options,
  onSelect,
  disabled,
}: {
  value: number | null;
  valueName: string | null;
  options: { id: number; name: string }[];
  onSelect: (id: number) => void;
  disabled?: boolean;
}) {
  // A saved category the list no longer offers (retired/renamed) still renders
  // as the current value, but is not selectable again.
  const stale = value !== null && !options.some((option) => option.id === value);
  return (
    <select
      // Fixed-width table column; without this the select overflows its cell.
      style={{ maxWidth: '100%' }}
      value={value ?? ''}
      disabled={disabled}
      onChange={(e) => {
        if (!e.target.value) return;
        onSelect(Number(e.target.value));
      }}
    >
      <option value="" disabled hidden>
        none
      </option>
      {stale && (
        <option value={value} disabled hidden>
          {valueName ?? 'unavailable'}
        </option>
      )}
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.name}
        </option>
      ))}
    </select>
  );
}

export default function AccountPage({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = use(params);
  // Keyed so switching accounts remounts instead of showing stale state.
  return <AccountView key={accountId} accountId={accountId} />;
}

function AccountView({ accountId }: { accountId: string }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [card, setCard] = useState<Card | null>(null);
  const [creditCategories, setCreditCategories] = useState<CreditCategory[]>([]);
  const [transactionList, setTransactionList] = useState<Transaction[]>([]);
  // `total` is null until a transactions read lands: "unknown", not 0.
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState<number | null>(null);
  // `loading` covers the first load only, and ends once both effects have settled.
  const [accountLoadSettled, setAccountLoadSettled] = useState(false);
  const [transactionsLoadSettled, setTransactionsLoadSettled] = useState(false);
  const loading = !accountLoadSettled || !transactionsLoadSettled;
  // Bumped by Retry to re-run both load effects.
  const [reloadKey, setReloadKey] = useState(0);
  // The page the rows on screen came from (-1 until the first successful read).
  const [loadedPage, setLoadedPage] = useState(-1);
  // The request that last settled, success or failure. Keyed on both effect
  // inputs so a Retry of the same page still counts as in flight.
  const [settledRequest, setSettledRequest] = useState<{ page: number; reloadKey: number } | null>(
    null,
  );
  // Separate from `loading` so a page turn keeps the old rows up with the
  // pager disabled instead of blanking the account body.
  const pageLoading = settledRequest?.page !== page || settledRequest.reloadKey !== reloadKey;
  // The pager's range and buttons are based on the rows actually on screen.
  const shownPage = loadedPage >= 0 ? loadedPage : page;
  // One error slice per effect, since the two loads settle independently.
  const [accountError, setAccountError] = useState<string | null>(null);
  const [transactionsError, setTransactionsError] = useState<string | null>(null);
  const error = [accountError, transactionsError].filter(Boolean).join('; ') || null;
  // Which reads actually came back; a failed read is not evidence of anything.
  const [loaded, setLoaded] = useState({ account: false, transactions: false, cards: false });

  // Account + card catalog. Not keyed on `page`: paging only re-reads transactions.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // allSettled so one failure doesn't discard the sibling that did arrive
      // (design: partial-load-rendering).
      const [accountResult, cardsResult] = await Promise.allSettled([
        fetch(`/api/accounts?accountId=${encodeURIComponent(accountId)}`).then((res) =>
          readJson(res, 'Failed to load account'),
        ),
        fetch('/api/cards').then((res) => readJson(res, 'Failed to load cards')),
      ]);
      if (cancelled) return;

      const loadedAccount: Account | null =
        accountResult.status === 'fulfilled' ? (accountResult.value.accounts?.[0] ?? null) : null;
      if (accountResult.status === 'fulfilled') setAccount(loadedAccount);
      if (cardsResult.status === 'fulfilled') {
        setCreditCategories(cardsResult.value.creditCategories ?? []);
        // The card depends on both reads, so it is only recomputed when both
        // succeeded; otherwise it is left as it was.
        if (accountResult.status === 'fulfilled') {
          const cards: Card[] = cardsResult.value.cards ?? [];
          setCard(cards.find((c) => c.id === loadedAccount?.cardId) ?? null);
        }
      }
      setLoaded((prev) => ({
        ...prev,
        account: accountResult.status === 'fulfilled',
        cards: cardsResult.status === 'fulfilled',
      }));

      const failures = [accountResult, cardsResult].filter(
        (result): result is PromiseRejectedResult => result.status === 'rejected',
      );
      for (const failure of failures) console.error(failure.reason);
      setAccountError(
        failures.length > 0
          ? failures
              .map((f) => (f.reason instanceof Error ? f.reason.message : 'Failed to load'))
              .join('; ')
          : null,
      );
      setAccountLoadSettled(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId, reloadKey]);

  // Transactions for the current page.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [txnResult] = await Promise.allSettled([
        fetch(
          `/api/transactions?accountId=${encodeURIComponent(accountId)}&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`,
        ).then((res) => readJson(res, 'Failed to load transactions')),
      ]);
      if (cancelled) return;

      if (txnResult.status === 'fulfilled') {
        setTransactionList(txnResult.value.transactions ?? []);
        if (typeof txnResult.value.total === 'number') setTotal(txnResult.value.total);
        setLoaded((prev) => ({ ...prev, transactions: true }));
        setTransactionsError(null);
        setLoadedPage(page);
      } else {
        console.error(txnResult.reason);
        setLoaded((prev) => ({ ...prev, transactions: false }));
        setTransactionsError(
          txnResult.reason instanceof Error ? txnResult.reason.message : 'Failed to load',
        );
        // loadedPage is left alone: the rows on screen are still its rows.
      }
      setSettledRequest({ page, reloadKey });
      setTransactionsLoadSettled(true);

      // Clamp back onto the last real page if the account shrank under the pager.
      if (txnResult.status === 'fulfilled' && typeof txnResult.value.total === 'number') {
        const lastPage = Math.max(0, Math.ceil(txnResult.value.total / PAGE_SIZE) - 1);
        if (page > lastPage) setPage(lastPage);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId, page, reloadKey]);

  // PATCHes outlive the effects, so unmount is tracked for the component's
  // lifetime; it mainly stops the alert() in send() firing on another page.
  const unmounted = useRef(false);
  useEffect(() => {
    // Reset on mount too, for StrictMode's mount/unmount/remount.
    unmounted.current = false;
    return () => {
      unmounted.current = true;
    };
  }, []);

  // Per-row PATCH bookkeeping. The row is reconciled only when the last patch
  // of a burst settles: show the newest committed response, or else the
  // pre-burst baseline.
  const patchState = useRef(
    new Map<
      string,
      {
        issued: number;
        pending: number;
        baseline: Transaction;
        committed: { seq: number; row: Transaction } | null;
      }
    >(),
  );

  // Per-row PATCH chain, so a row has at most one request in flight and
  // issue order, commit order and response order agree.
  const patchChain = useRef(new Map<string, Promise<void>>());

  const setCategory = async (
    transactionId: string,
    kind: 'card' | 'credit',
    categoryId: number,
  ) => {
    // Bookkeeping stays outside setState updaters, which must be pure.
    const inFlight = patchState.current.get(transactionId);
    const seq = (inFlight?.issued ?? 0) + 1;
    if (inFlight) {
      inFlight.issued = seq;
      inFlight.pending++;
    } else {
      const baseline = transactionList.find((txn) => txn.transactionId === transactionId);
      if (!baseline) return;
      patchState.current.set(transactionId, { issued: seq, pending: 1, baseline, committed: null });
    }

    // Each kind touches only its own fields; a row never holds both kinds.
    const { body, patch } =
      kind === 'card'
        ? (() => {
            const category = card?.categories.find((c) => c.id === categoryId) ?? null;
            return {
              body: { cardCategoryId: categoryId },
              patch: {
                cardCategoryId: categoryId,
                cardCategoryName: category?.name ?? null,
                rewardRate: category?.rate ?? null,
              },
            };
          })()
        : (() => {
            const category = creditCategories.find((c) => c.id === categoryId) ?? null;
            return {
              body: { creditCategoryId: categoryId },
              patch: { creditCategoryId: categoryId, creditCategoryName: category?.name ?? null },
            };
          })();

    // Optimistic update so the controlled select never snaps back.
    setTransactionList((list) =>
      list.map((txn) => (txn.transactionId === transactionId ? { ...txn, ...patch } : txn)),
    );

    const send = async () => {
      let failure: string | null = null;
      try {
        const res = await fetch(`/api/transactions/${encodeURIComponent(transactionId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await readJson(res, 'Failed to update category');
        const state = patchState.current.get(transactionId);
        if (state && seq > (state.committed?.seq ?? 0)) {
          state.committed = { seq, row: { ...state.baseline, ...data.transaction } };
        }
      } catch (err) {
        failure = err instanceof Error ? err.message : 'Failed to update category';
      }

      const state = patchState.current.get(transactionId);
      if (state && --state.pending === 0) {
        const settled = state.committed?.row ?? state.baseline;
        patchState.current.delete(transactionId);
        if (!unmounted.current) {
          setTransactionList((list) =>
            list.map((txn) => (txn.transactionId === transactionId ? settled : txn)),
          );
        }
      }
      // Only the newest patch's failure is reported.
      if (failure && state?.issued === seq && !unmounted.current) alert(failure);
    };

    const previous = patchChain.current.get(transactionId);
    const run = previous ? previous.catch(() => {}).then(send) : send();
    patchChain.current.set(transactionId, run);
    await run.catch(() => {});
    if (patchChain.current.get(transactionId) === run) patchChain.current.delete(transactionId);
  };

  // After a failed read `page` may already equal the target, so a plain
  // setPage would re-run nothing; bump reloadKey instead.
  const goToPage = (next: number) => {
    if (next === page) setReloadKey((key) => key + 1);
    else setPage(next);
  };

  // Design: stale-lists-disable-editing.
  const categoriesMayBeStale = !loaded.cards || !loaded.account;
  const rateHeader = card ? (card.type === 'points' ? 'Multiplier' : 'Cashback %') : 'Rate';

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
              setAccountError(null);
              setTransactionsError(null);
              setReloadKey((key) => key + 1);
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
          {/* total is the account's own count, so this can't fire on a page past the end. */}
          {loaded.transactions && total === 0 && <p>No transactions.</p>}
          {/* Fixed layout so column widths don't shift between pages. */}
          {transactionList.length > 0 && (
            <table
              border={1}
              style={{ tableLayout: 'fixed', width: '100%', overflowWrap: 'break-word' }}
            >
              <colgroup>
                <col style={{ width: '8%' }} />
                <col style={{ width: '25%' }} />
                <col style={{ width: '15%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '7%' }} />
                <col style={{ width: '21%' }} />
                <col style={{ width: '9%' }} />
                <col style={{ width: '7%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Name</th>
                  <th>Merchant</th>
                  <th>Amount</th>
                  <th>Currency</th>
                  <th>Category</th>
                  <th>{rateHeader}</th>
                  <th>Pending</th>
                </tr>
              </thead>
              <tbody>
                {transactionList.map((txn) => {
                  // Inflow rows pick from credit categories, spend rows from the card's.
                  const kind = isInflowAmount(txn.amount) ? 'credit' : 'card';
                  const options = kind === 'credit' ? creditCategories : card.categories;
                  const selectedId = kind === 'credit' ? txn.creditCategoryId : txn.cardCategoryId;
                  const selectedName =
                    kind === 'credit' ? txn.creditCategoryName : txn.cardCategoryName;
                  return (
                    <tr key={txn.transactionId}>
                      <td>{txn.date}</td>
                      <td>{txn.name}</td>
                      <td>{txn.merchantName}</td>
                      <td>{txn.amount}</td>
                      <td>{txn.isoCurrencyCode}</td>
                      <td>
                        {options.length > 0 ? (
                          <CategorySelect
                            value={selectedId}
                            valueName={selectedName}
                            options={options}
                            onSelect={(id) => setCategory(txn.transactionId, kind, id)}
                            disabled={categoriesMayBeStale}
                          />
                        ) : (
                          (selectedName ?? 'none')
                        )}
                      </td>
                      {/* A rate with no category link is legacy data; shown but marked. */}
                      <td>
                        {kind === 'credit'
                          ? '—'
                          : txn.rewardRate !== null && txn.cardCategoryId === null
                            ? `${txn.rewardRate} (unlinked)`
                            : txn.rewardRate}
                      </td>
                      <td>{txn.pending ? 'yes' : ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
