'use client';

import Link from 'next/link';
import { use, useEffect, useRef, useState } from 'react';
import { isInflowAmount } from '@/lib/amounts';
import { readJson } from '@/lib/http';

// SUPPORTED-ACCOUNT RULE — the concept the rest of the codebase points back to
// (src/lib/sync.ts, src/app/api/exchange/route.ts, scripts/seed-cards.ts,
// src/app/api/transactions/[transactionId]/route.ts):
//
// Every account SpendRight actually works with is matched to a card definition
// (src/db/cards.seed.ts -> accounts.card_id, matched by Plaid account name).
// In practice that is every account the user connects. An account with no
// match is UNSUPPORTED: this page renders "Card not supported" and offers no
// transactions and no categorization at all. There is therefore no such thing
// as categorizing a transaction on an account with no card — don't write code
// that tries to make that case work.
//
// The other half of the rule: unmatched is a temporary, unknown state — a
// cosmetic Plaid account rename drops the match until the seed file catches up
// — NOT an instruction to erase data. No writer may clear or drop a user's
// saved category merely because the account's card_id is currently NULL; only
// a match to a DIFFERENT card invalidates saved card categories. Selections
// just go quiet behind this screen and come back intact once the account is
// supported again.

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

// One picker for both category kinds. The 'none' placeholder is deliberately
// disabled+hidden: a transaction keeps a category once one is assigned.
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
  // Set while the category catalog could not be re-read — see the call site.
  disabled?: boolean;
}) {
  // A saved category the list can't offer — the account moved to another card,
  // the category was renamed — still has to render as the current value or the
  // select would show blank. It carries the same disabled placeholder
  // treatment as 'none': visible as what is selected, never selectable again.
  const stale = value !== null && !options.some((option) => option.id === value);
  return (
    // The empty-value guard is insurance, not a live bug: both placeholders are
    // `disabled`, which every current browser honours by making them
    // unselectable. Without it, a UA that ever let one through would send
    // Number('') === 0 and get back a 400 in an alert; a no-op is the right
    // answer for a placeholder either way.
    <select
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
  // Keyed so switching accounts remounts rather than reusing this state: the
  // previous account's header, balances and rows can never sit on screen
  // looking loaded while the new account is still fetching.
  return <AccountView key={accountId} accountId={accountId} />;
}

function AccountView({ accountId }: { accountId: string }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [card, setCard] = useState<Card | null>(null);
  const [creditCategories, setCreditCategories] = useState<CreditCategory[]>([]);
  const [transactionList, setTransactionList] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Which of the three loads actually came back. Each message below ("Account
  // not found", "Card not supported", "No transactions") asserts something
  // about what the database holds, and a read that failed is not evidence for
  // any of them — it only means this page does not know.
  const [loaded, setLoaded] = useState({ account: false, transactions: false, cards: false });
  // Bumped by the Retry button below to re-run the load effect. This page has
  // no other way back from a transient failure: the effect keys off accountId
  // alone, and nothing here re-fetches — so a blip on /api/cards left the
  // account stuck showing an error with no card, no transactions section and no
  // recovery short of a full page reload. HomeClient carries the same button
  // for the same reason.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    // A response that arrives after this component is gone (or after a
    // StrictMode re-run) must not write to it.
    let cancelled = false;
    (async () => {
      // Three independent endpoints, so each settles on its own — fetch AND
      // parse together, one promise per endpoint, for the same reason as the
      // load in HomeClient: Promise.all over the fetches turns a single
      // rejection into a total failure that discards the siblings that did
      // arrive, and splitting fetch from parse only moves the bug one layer
      // down (fetch itself rejects on a reset connection or a failed DNS
      // lookup).
      //
      // Here the whole page was the cost. A blip on /api/cards alone rendered
      // "Error: Failed to load cards" and nothing else — no header, no
      // balances, no rows — even though the account and its transactions had
      // both come back 200.
      const [accountResult, txnResult, cardsResult] = await Promise.allSettled([
        fetch(`/api/accounts?accountId=${encodeURIComponent(accountId)}`).then((res) =>
          readJson(res, 'Failed to load account'),
        ),
        fetch(`/api/transactions?accountId=${encodeURIComponent(accountId)}`).then((res) =>
          readJson(res, 'Failed to load transactions'),
        ),
        fetch('/api/cards').then((res) => readJson(res, 'Failed to load cards')),
      ]);
      if (cancelled) return;

      // The card is the intersection of two responses — the account's cardId
      // and the catalog — so it is RECOMPUTED only when both arrived. With
      // either missing it is left exactly as it was (see the note on the
      // setCard call below), which on a first load means it is still null and
      // the transactions section simply does not render, and on a retry means
      // the previously resolved card stays on screen rather than the page
      // claiming the account is unsupported. Either way the two `loaded` flags
      // are what gate the "Card not supported" message, never `card` alone.
      const loadedAccount: Account | null =
        accountResult.status === 'fulfilled' ? (accountResult.value.accounts?.[0] ?? null) : null;
      if (accountResult.status === 'fulfilled') setAccount(loadedAccount);
      if (txnResult.status === 'fulfilled') setTransactionList(txnResult.value.transactions ?? []);
      if (cardsResult.status === 'fulfilled') {
        setCreditCategories(cardsResult.value.creditCategories ?? []);
        // Both responses, or neither. Resolving the card from the catalog
        // alone reads a FAILED account load as `loadedAccount === null` and
        // writes card = null from it — which is the opposite of "it stays
        // null", because on a Retry the previous load's `account` is still in
        // state: the page would keep showing the account, drop its
        // transactions table and assert "Card not supported" purely because
        // /api/accounts blipped. A read that failed is not evidence about the
        // card, so the card is left exactly as it was.
        if (accountResult.status === 'fulfilled') {
          const cards: Card[] = cardsResult.value.cards ?? [];
          setCard(cards.find((c) => c.id === loadedAccount?.cardId) ?? null);
        }
      }
      setLoaded({
        account: accountResult.status === 'fulfilled',
        transactions: txnResult.status === 'fulfilled',
        cards: cardsResult.status === 'fulfilled',
      });

      // And say so on screen, next to whatever did render. A half-loaded page
      // presented as the whole truth is what made the old failure look like an
      // empty account: console.error is not a user surface.
      const failures = [accountResult, txnResult, cardsResult].filter(
        (result): result is PromiseRejectedResult => result.status === 'rejected',
      );
      for (const failure of failures) console.error(failure.reason);
      setError(
        failures.length > 0
          ? failures
              .map((f) => (f.reason instanceof Error ? f.reason.message : 'Failed to load'))
              .join('; ')
          : null,
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // reloadKey is a dependency purely so Retry re-runs this. The `cancelled`
    // cleanup is what makes a double-click safe: the superseded run's writes
    // are discarded, so an older, slower response can never land after a newer
    // one.
  }, [accountId, reloadKey]);

  // The load effect cancels itself with a local flag, but a PATCH is fired from
  // an event handler and outlives the effect that could have cancelled it, so it
  // needs a component-lifetime one. What it actually protects is the alert() at
  // the end of send(): "Back" or an account switch (which remounts, via
  // key={accountId}) unmounts this view with a request still in flight, and its
  // failure would otherwise pop a modal on the home page or on a DIFFERENT
  // account, blaming a row that is no longer on screen. The setTransactionList
  // is guarded for the same reason but is only tidiness — a state update on an
  // unmounted component is a no-op in React 18, not a leak or a warning.
  const unmounted = useRef(false);
  useEffect(() => {
    // Reset on mount, not just set on unmount: StrictMode mounts, unmounts and
    // remounts in dev, so a cleanup-only version would leave the remounted view
    // permanently marked as gone and silence every patch it makes.
    unmounted.current = false;
    return () => {
      unmounted.current = true;
    };
  }, []);

  // PATCH bookkeeping for the rows with a request in flight, keyed by
  // transactionId:
  //   issued    monotonic sequence, so an older response can never be mistaken
  //             for the newest selection
  //   pending   how many patches for this row are still in flight
  //   baseline  the last server-confirmed row, captured before the burst began
  //             (rolling back to the on-screen row instead would restore an
  //             earlier optimistic value when several patches fail in a row)
  //   committed the newest response that actually committed on the server
  //
  // The rendered row is reconciled only when the LAST patch of a burst
  // settles, never as each one lands: a patch that fails part-way through a
  // burst would otherwise roll the row back to the pre-burst value while the
  // user is still clicking, and the user's newest choice would be replaced by
  // an older one that happened to succeed.
  //
  // This only decides what to SHOW. Which value the server ends up holding is
  // decided by patchChain below — see the note there.
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

  // The tail of each row's PATCH chain, so a row has at most one request in
  // flight. Ordering the responses is not enough on its own: the server's
  // final value is decided by the order concurrent requests win the row's
  // `select … for update` lock, and that order has nothing to do with the
  // order they were issued. Fire three changes at one row and the third can
  // take the lock first and commit first, the second commit last — every
  // response says 200, the newest response describes a write that has already
  // been overwritten, and the row shows a value the database does not hold
  // until the next reload. Chaining makes issue order, commit order and
  // response order the same thing, which is what patchState assumes.
  const patchChain = useRef(new Map<string, Promise<void>>());

  const setCategory = async (
    transactionId: string,
    kind: 'card' | 'credit',
    categoryId: number,
  ) => {
    // Bookkeeping happens here, not inside the setState updater: updaters must
    // stay pure (StrictMode runs them twice, which would double-count).
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

    // One per-kind patch, built once and shared by the optimistic update and
    // the request body. Each kind touches only its own fields — a row never
    // holds the other kind (server + DB sign constraint), so nothing to clear.
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

    // Optimistic update, synchronously in the change event, so the controlled
    // select never snaps back while the request is in flight.
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
        // Recorded whether or not this patch is still the newest one: a commit
        // is a fact about the server, and the newest commit is what the row
        // must end up showing.
        const state = patchState.current.get(transactionId);
        if (state && seq > (state.committed?.seq ?? 0)) {
          state.committed = { seq, row: { ...state.baseline, ...data.transaction } };
        }
      } catch (err) {
        failure = err instanceof Error ? err.message : 'Failed to update category';
      }

      const state = patchState.current.get(transactionId);
      if (state && --state.pending === 0) {
        // Everything issued for this row has settled, so the guessing stops:
        // show the newest response that committed, or — if none did — the row
        // as the server last confirmed it before the burst.
        const settled = state.committed?.row ?? state.baseline;
        patchState.current.delete(transactionId);
        if (!unmounted.current) {
          setTransactionList((list) =>
            list.map((txn) => (txn.transactionId === transactionId ? settled : txn)),
          );
        }
      }
      // Only the newest patch's failure is worth interrupting for: an older one
      // the user has already replaced isn't news — and neither is any of them
      // once this view is gone (see the unmounted ref above).
      if (failure && state?.issued === seq && !unmounted.current) alert(failure);
    };

    // Queue behind whatever this row already has in flight. The `catch` keeps
    // one broken link from stalling the rest of the chain — send() reports a
    // failed request rather than throwing, so it only covers the unexpected.
    const previous = patchChain.current.get(transactionId);
    const run = previous ? previous.catch(() => {}).then(send) : send();
    patchChain.current.set(transactionId, run);
    await run.catch(() => {});
    // Last patch of the burst clears the chain, so the map doesn't grow for
    // the life of the page. The identity check is what makes that safe: a
    // newer patch queued while this one was in flight owns the entry now.
    if (patchChain.current.get(transactionId) === run) patchChain.current.delete(transactionId);
  };

  // Both option lists are only trustworthy when BOTH reads landed — see the
  // note above the table.
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
          {/* The error is cleared on click, not left standing until the reload
              answers. `loading` is already false by the time this button
              exists and the effect does not reset it, so without this a Retry
              that fails the same way repaints an identical line and the click
              looks like it did nothing. Clearing gives the press an immediate
              effect; the message comes back if the reload fails again.
              `loading` is deliberately NOT set back to true — it gates the
              account body below, and blanking the rows the page did manage to
              load is a worse answer than leaving them up. */}
          <button
            onClick={() => {
              setError(null);
              setReloadKey((key) => key + 1);
            }}
          >
            Retry
          </button>
        </p>
      )}
      {/* No such account — a stale bookmark, or an id typed by hand. Both
          content branches below need a loaded account, so without this the
          page would render nothing at all under the heading and read as
          broken. */}
      {!loading && loaded.account && !account && (
        <p>Account not found. It may have been disconnected — check the list on the home page.</p>
      )}
      {/* Unsupported account (see the supported-account rule at the top of this
          file): no matched card, so no transactions and no pickers — every
          category on this page is a category of some card. The identity and
          balances above still render so the user can tell which account this
          is. Anything the user already categorized is untouched in the
          database and reappears when the account matches a card again. */}
      {/* Gated on loaded.account as well as loaded.cards: this claims the
          account matches no card, which takes a current read of BOTH. `account`
          alone can be a previous load's row still in state after a failed
          refresh, and the card is not recomputed in that case (see the load
          effect), so without this the message could outlive the reads it
          rests on. */}
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
          {/* Editing is switched off whenever the option lists may be stale.
              BOTH reads matter, which is not obvious: creditCategories is
              rewritten whenever /api/cards succeeds, but card.categories lives
              on `card`, and `card` is only recomputed when the ACCOUNT read
              succeeded too (see the setCard call in the load effect). So a
              cards-only success still leaves the spend picker showing the
              previous load's categories, and gating on `!loaded.cards` alone
              missed exactly the case this exists for.

              Why it matters: if a seed run dropped a category, or the account
              was renamed in Plaid and no longer matches this card, picking one
              PATCHes a category that doesn't belong to the account's card and
              comes back as a 400 in an alert(). The server is the real guard
              and refuses the write, so nothing is corrupted; disabling just
              stops offering a choice the page cannot currently stand behind.

              One rule for both pickers rather than one per kind: the inflow
              list IS fresh on a cards-only success, so this over-disables it in
              that one case. Deliberate — a second gate is a second thing to get
              subtly wrong, and this mechanism has already been wrong once for
              that reason.

              Disabled rather than hidden, with rows, balances and saved
              assignments all still up: the same trade the rest of this page
              makes — a read that failed is not a reason to blank what did
              load. The text avoids naming the Retry button because that button
              is cleared from the screen while a reload is in flight. It says
              "may be out of date" rather than "couldn't be refreshed" because
              of the over-disabling noted just above: on a cards-only success
              the inflow list DID refresh, so the stronger wording would be
              false in one of the two states this renders in. */}
          {categoriesMayBeStale && (
            <p>Category lists may be out of date — editing is off until they refresh.</p>
          )}
          {loaded.transactions && transactionList.length === 0 && <p>No transactions.</p>}
          {transactionList.length > 0 && (
            <table border={1}>
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
                  // Inflow rows pick from the global credit categories, spend
                  // rows from the matched card's categories. The card is always
                  // there: an unmatched account never reaches this table.
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
                        {/* The picker is offered whenever there is anything to
                            pick, even if the saved id isn't among the options:
                            the server accepts any valid category, so
                            re-categorizing a row must never become impossible.
                            With no options at all (a card whose categories
                            aren't seeded yet, or no credit categories seeded)
                            there is nothing to offer, so the assignment shows
                            as text rather than as an empty select. */}
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
                      {/* A rate with no category link is history the system
                          deliberately keeps (see the reward_rate note in
                          src/db/schema.ts and "(rates kept)" in
                          scripts/seed-cards.ts), but the column header above is
                          the CURRENT card's unit — "Cashback %" or
                          "Multiplier". A 4x multiplier earned on a points card
                          would read as 4% cashback once the account matches a
                          cashback card. The row no longer records which card
                          the rate came from, so an orphan whose category was
                          merely dropped from this same card is indistinguishable
                          from one left by a card move: the honest answer is to
                          keep showing the number and stop claiming the header's
                          unit applies to it. Marked rather than hidden — this
                          is the only place the user can see that history at
                          all. */}
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
        </>
      )}
    </main>
  );
}
