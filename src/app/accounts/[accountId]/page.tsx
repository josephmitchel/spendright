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

// Rows per page. The API's own default is 500 and its cap is 1000
// (src/app/api/transactions/route.ts); the page size is this page's decision,
// sent on every request so it never depends on that default. Before this, the
// page asked for no bounds at all and rendered whatever came back — which meant
// an account with more than 500 transactions showed the newest 500 and said
// nothing about the rest.
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
      // The picker sits in a fixed-width column (see the table below), which
      // cannot stretch for it the way an auto column did. A select is otherwise
      // as wide as its widest option — "Select Streaming Services" — so without
      // this it would spill out of its cell over the next column.
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
  // Zero-based page of transactions, and the account's total row count as the
  // server last reported it. `total` is null until a transactions read lands —
  // "unknown", which is not the same as 0, so the pager and the "No
  // transactions" message both hold off rather than assert an empty account.
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState<number | null>(null);
  // `loading` gates the whole account body and covers the FIRST load only. It
  // ends when BOTH effects below have settled once: they run independently now
  // (see the note above the account effect), and letting that one end it on its
  // own would flash an empty table under a loaded header while the rows were
  // still in flight. Neither flag ever goes back to false — Retry deliberately
  // leaves whatever did load on screen.
  const [accountLoadSettled, setAccountLoadSettled] = useState(false);
  const [transactionsLoadSettled, setTransactionsLoadSettled] = useState(false);
  const loading = !accountLoadSettled || !transactionsLoadSettled;
  // Bumped by the Retry button below to re-run both load effects. This page has
  // no other way back from a transient failure: the effects key off accountId
  // and page, and nothing here re-fetches — so a blip on /api/cards left the
  // account stuck showing an error with no card, no transactions section and no
  // recovery short of a full page reload. HomeClient carries the same button
  // for the same reason. Declared up here because settledRequest below is keyed
  // on it as well as on `page`.
  const [reloadKey, setReloadKey] = useState(0);
  // The page number the rows on screen actually came from — -1 until the first
  // response lands. It and settledRequest below are both records of what the
  // effect last did that the pager's state is DERIVED from, rather than flags
  // the effect sets, which is what the react-hooks lint rule wants (a setState
  // in an effect body is a second render pass) and simpler to reason about:
  // each comparison says exactly one thing.
  //
  // Set only when the read SUCCEEDED, which is why it is no longer what
  // re-enables the pager: `transactionList` is only replaced on success too, so
  // advancing this on a failed read made the pager say "Showing 21–40 of 57"
  // over page 0's rows and let the user page on from a page that never arrived.
  const [loadedPage, setLoadedPage] = useState(-1);
  // The REQUEST that last settled, success or failure — the in-flight marker
  // the two buttons key off, so a failed page read re-enables them instead of
  // freezing the pager. Split from loadedPage rather than shared with it
  // because the two answer different questions: this one is "is a request
  // outstanding", loadedPage is "where did these rows come from", and a failed
  // turn is the state where those disagree. There the buttons come back, the
  // rows and the range stay on the page that did load, and the error banner's
  // Retry re-requests the page the user asked for.
  //
  // A request is identified by BOTH of the transactions effect's keys, not by
  // the page number alone: Retry bumps reloadKey and re-runs the effect for the
  // SAME page, which a page-only marker cannot see as a new request. The pager
  // then stayed enabled with no "Loading…" through the whole retry, and a click
  // during it changed `page` — so the retry's response was thrown away by the
  // `cancelled` cleanup with nothing on screen having said it was in flight.
  const [settledRequest, setSettledRequest] = useState<{ page: number; reloadKey: number } | null>(
    null,
  );
  // Deliberately NOT `loading`: that one gates the whole account body, so
  // reusing it would blank the table, the pager and the header on every click
  // and make the pager jump out from under the cursor. The old rows stay up
  // with the buttons disabled until the new ones arrive.
  const pageLoading = settledRequest?.page !== page || settledRequest.reloadKey !== reloadKey;
  // The rows on screen came from loadedPage, so the pager's range is counted
  // off that rather than off `page`. The two differ while a turn is in flight
  // and after one that failed, and labelling those rows with a range they did
  // not come from is the bug this pair exists to prevent.
  const shownPage = loadedPage >= 0 ? loadedPage : page;
  // One error slice per effect, joined for display. The two loads settle
  // independently, so a single string would let whichever finished last speak
  // for both — a transactions failure would erase a standing account error, and
  // a later account success would erase the transactions one.
  const [accountError, setAccountError] = useState<string | null>(null);
  const [transactionsError, setTransactionsError] = useState<string | null>(null);
  const error = [accountError, transactionsError].filter(Boolean).join('; ') || null;
  // Which of the three loads actually came back. Each message below ("Account
  // not found", "Card not supported", "No transactions") asserts something
  // about what the database holds, and a read that failed is not evidence for
  // any of them — it only means this page does not know.
  const [loaded, setLoaded] = useState({ account: false, transactions: false, cards: false });

  // The account and the card catalog. Keyed on the account and Retry only — NOT
  // on `page`: neither read has anything to do with which page of transactions
  // is on screen, and keeping them in the paged effect made every page turn
  // carry their failure modes. A blip on /api/cards while merely paging flipped
  // categoriesMayBeStale on and disabled every picker; a blip on /api/accounts
  // froze `card` and put an error banner up. Paging now touches nothing but the
  // transactions effect below.
  useEffect(() => {
    // A response that arrives after this component is gone (or after a
    // StrictMode re-run) must not write to it.
    let cancelled = false;
    (async () => {
      // Two independent endpoints, so each settles on its own — fetch AND
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
      const [accountResult, cardsResult] = await Promise.allSettled([
        fetch(`/api/accounts?accountId=${encodeURIComponent(accountId)}`).then((res) =>
          readJson(res, 'Failed to load account'),
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
      // Merged rather than replaced: the transactions flag belongs to the other
      // effect now, and either one may settle first.
      setLoaded((prev) => ({
        ...prev,
        account: accountResult.status === 'fulfilled',
        cards: cardsResult.status === 'fulfilled',
      }));

      // And say so on screen, next to whatever did render. A half-loaded page
      // presented as the whole truth is what made the old failure look like an
      // empty account: console.error is not a user surface.
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
    // reloadKey is a dependency purely so Retry re-runs this.
  }, [accountId, reloadKey]);

  // The transactions, on their own effect: this is the only one of the three
  // reads that depends on `page` (see the note above).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // allSettled over the single request, rather than try/catch, so the
      // rejection is a value handled alongside the success — the bookkeeping
      // below runs either way.
      const [txnResult] = await Promise.allSettled([
        fetch(
          `/api/transactions?accountId=${encodeURIComponent(accountId)}&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`,
        ).then((res) => readJson(res, 'Failed to load transactions')),
      ]);
      if (cancelled) return;

      if (txnResult.status === 'fulfilled') {
        setTransactionList(txnResult.value.transactions ?? []);
        // Left alone when the response carries no count, for the same reason
        // the card is: a value that did not arrive is not evidence of zero.
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
        // loadedPage is deliberately NOT touched here: the rows on screen are
        // still the ones it names, and the pager reads its range off it.
      }
      // Either way the request is over, so the buttons come back — see the note
      // on settledRequest.
      setSettledRequest({ page, reloadKey });
      setTransactionsLoadSettled(true);

      // Land back on the last real page when this one is past the end. A sync
      // that removed rows, or an item disconnected in another tab, can shrink
      // the account under a pager that is sitting on page 5 — and an offset
      // past the end returns an empty page, which would otherwise read as "no
      // transactions" with no way back except Back. Setting `page` re-runs this
      // effect; it cannot loop, because the page it moves to is by
      // construction inside the count it just read.
      if (txnResult.status === 'fulfilled' && typeof txnResult.value.total === 'number') {
        const lastPage = Math.max(0, Math.ceil(txnResult.value.total / PAGE_SIZE) - 1);
        if (page > lastPage) setPage(lastPage);
      }
    })();
    return () => {
      cancelled = true;
    };
    // reloadKey is a dependency purely so Retry re-runs this. The `cancelled`
    // cleanup is what makes a double-click safe: the superseded run's writes
    // are discarded, so an older, slower response can never land after a newer
    // one — which is also what makes fast clicking through pages safe.
  }, [accountId, page, reloadKey]);

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

  // The only way the pager changes pages. Not `setPage` directly, because the
  // page the buttons step from is shownPage (the rows on screen) while the page
  // the effect is keyed on is `page` (the last one asked for), and after a
  // failed read those disagree: stepping forward from shownPage then names the
  // page number `page` already holds, setState with an unchanged value re-runs
  // no effect, and the button is dead exactly on the failure it should retry.
  // Bumping reloadKey makes that press a fresh request instead.
  const goToPage = (next: number) => {
    if (next === page) setReloadKey((key) => key + 1);
    else setPage(next);
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
              // Both slices, because the banner is their join: clearing one
              // would leave the other's message standing and make the press
              // look like it half-worked.
              setAccountError(null);
              setTransactionsError(null);
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
          {/* "This account has none", not "this page has none": on a page
              past the end the list is empty for a moment before the clamp in
              the load effect moves back, and claiming the account is empty
              there would be wrong. total === 0 is the account's own count. */}
          {loaded.transactions && total === 0 && <p>No transactions.</p>}
          {/* Fixed layout with declared column widths, and it is the pager
              that makes it necessary. There is no CSS in this project, so an
              `auto` table sizes its columns from the rows it currently holds:
              with all of an account's transactions in one table that happened
              once, but a page of 20 recomputes it, and what a page needs
              depends on what is in it — a page with categories assigned wants
              a wider Category column than a page of "none", enough to push
              the whole table past the window. Past it, the browser compresses
              every column to fit and Name starts wrapping onto two lines, so
              paging back and forth visibly squished and unsquished the table.
              Declared widths make the geometry the same on every page.

              Percentages of a full-width table rather than pixels: the
              columns keep their proportions at any window size. `break-word`
              is the safety net a fixed layout needs — a column can no longer
              grow for an unusually long merchant name, so it has to be
              allowed to break inside one instead of overflowing its cell. */}
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
          {/* The pager renders whenever the account's count is known and there
              is anything to show, INCLUDING a single page — the "1–17 of 17"
              line is the answer to "is this all of them?", which is exactly
              what the unpaginated version could not give.

              Both buttons are disabled while a page is in flight, so a second
              click cannot queue a jump the user did not see: the load effect
              discards the superseded response, but the page number itself
              would still have moved twice. `total` is trusted for "Next"
              rather than a short page, because a page CAN come back short of
              PAGE_SIZE while rows exist behind it — a sync deleting rows
              between the count and the page read is enough. */}
          {total !== null && total > 0 && transactionList.length > 0 && (
            <p>
              {/* Counted off the rows actually on screen rather than off
                  PAGE_SIZE, so the range is right on the last page and on the
                  brief out-of-range render before the clamp lands — and off
                  shownPage rather than `page` for the same reason, so the range
                  describes the rows below it even while a turn is in flight. */}
              Showing {shownPage * PAGE_SIZE + 1}–{shownPage * PAGE_SIZE + transactionList.length}{' '}
              of {total}{' '}
              {/* Stepped off shownPage — the page the rows on screen came
                  from — rather than off `page`, which is only the page most
                  recently ASKED for. The two differ after a failed read: the
                  buttons are enabled again (see settledRequest) while `page`
                  is still one past the rows below, so `p + 1` skipped straight
                  over the page that failed and it was unreachable except
                  through Retry. The disabled tests use shownPage for the same
                  reason — "Previous" has to stay live on the page the user is
                  actually looking at. While a read is in flight the two agree
                  anyway, and both buttons are disabled regardless. */}
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
